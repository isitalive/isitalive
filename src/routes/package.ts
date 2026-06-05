// ---------------------------------------------------------------------------
// Package-first agent routes — resolve package names and score their repos
// ---------------------------------------------------------------------------

import { Hono, type Context } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import type { Env } from '../types/env'
import type { ParsedDep } from '../audit/parsers'
import { resolveDependency, type ResolvedDep } from '../audit/resolver'
import { CacheManager, cacheControlHeaders, TIERS, trackFirstSeen, type Tier } from '../cache/index'
import { buildProviderEvent } from '../events/provider'
import { buildResultEvent } from '../events/result'
import { buildUsageEvent, type UsageContext } from '../events/usage'
import { emitAll } from '../pipeline/emit'
import { fetchAndScoreProject, scheduleRevalidation } from '../providers/index'
import { classifyError, type ProviderErrorCode } from '../providers/errors'
import { parseIncludeFlags, shapeScoringResult } from '../utils/healthResponse'

type PackageEcosystem = 'npm' | 'go'
type AppEnv = { Bindings: Env; Variables: { tier: Tier; keyName: string | null; isAuthenticated: boolean } }
type PackageContext = Context<AppEnv>

const packageResolve = new Hono<AppEnv>()
const packageCheck = new Hono<AppEnv>()

function isSupportedEcosystem(value: string): value is PackageEcosystem {
  return value === 'npm' || value === 'go'
}

function isValidVersion(version: string): boolean {
  return version.length <= 200 && !/[\u0000-\u001f\u007f]/.test(version)
}

function isValidPackageName(ecosystem: PackageEcosystem, name: string): boolean {
  if (name.length === 0 || name.length > 214) return false
  if (/[\s\u0000-\u001f\u007f<>:"|?*\\]/.test(name)) return false
  if (name.includes('://') || name.split('/').includes('..')) return false

  if (ecosystem === 'npm') {
    return /^(@[a-z0-9._~-]+\/)?[a-z0-9._~-]+$/i.test(name)
  }

  return !name.startsWith('/') && name.includes('/') && name.split('/')[0].includes('.')
}

function parsePackageRequest(c: PackageContext):
  | { ok: true; dep: ParsedDep; ecosystem: PackageEcosystem; name: string; version: string }
  | { ok: false; response: Response } {
  const ecosystemParam = c.req.param('ecosystem') ?? ''
  if (!isSupportedEcosystem(ecosystemParam)) {
    return {
      ok: false,
      response: c.json({ error: `Unsupported ecosystem: ${ecosystemParam}`, error_code: 'unsupported_ecosystem', supported: ['npm', 'go'] }, 400),
    }
  }

  const name = c.req.query('name')?.trim() ?? ''
  const version = c.req.query('version')?.trim() ?? ''

  if (!isValidPackageName(ecosystemParam, name)) {
    return {
      ok: false,
      response: c.json({ error: 'Invalid package name', error_code: 'invalid_package_name' }, 400),
    }
  }

  if (!isValidVersion(version)) {
    return {
      ok: false,
      response: c.json({ error: 'Invalid package version', error_code: 'invalid_package_version' }, 400),
    }
  }

  return {
    ok: true,
    ecosystem: ecosystemParam,
    name,
    version,
    dep: {
      name,
      version,
      dev: false,
      ecosystem: ecosystemParam,
    },
  }
}

function resolutionPayload(resolved: ResolvedDep) {
  return {
    resolved: Boolean(resolved.github),
    github: resolved.github ? `${resolved.github.owner}/${resolved.github.repo}` : null,
    resolvedFrom: resolved.resolvedFrom ?? null,
    unresolvedReason: resolved.unresolvedReason,
  }
}

function cacheMeta(
  status: string,
  tier: Tier,
  ageSeconds: number | null,
  storedAt: string | null,
  freshUntil: string | null,
  staleUntil: string | null,
) {
  const config = TIERS[tier]
  return {
    cache: {
      status,
      tier,
      ageSeconds,
      dataFetchedAt: storedAt,
      freshUntil,
      staleUntil,
      nextRefreshSeconds: ageSeconds !== null
        ? Math.max(0, config.freshTtl - ageSeconds)
        : 0,
    },
  }
}

function buildUsageCtx(c: PackageContext, startTime: number, cacheStatus: string): UsageContext {
  return {
    source: 'api',
    apiKey: c.get('keyName') ?? 'anon',
    cacheStatus,
    responseTimeMs: Date.now() - startTime,
    cf: (c.req.raw as any).cf,
    userAgent: c.req.header('User-Agent') ?? null,
    ip: null,
  }
}

async function buildHealthResult(c: PackageContext, owner: string, repo: string, startTime: number) {
  const includeFlags = parseIncludeFlags(c.req.url)
  const tier: Tier = c.get('tier') ?? 'free'
  const isAuthenticated = c.get('isAuthenticated') ?? false
  const headers = cacheControlHeaders(tier, isAuthenticated)
  const cacheManager = new CacheManager(c.env, c.executionCtx)
  const provider = 'github'

  const cached = await cacheManager.get(provider, owner, repo, tier)
  if ((cached.status === 'l1-hit' || cached.status === 'l2-hit') && cached.result) {
    c.executionCtx.waitUntil(
      buildUsageEvent(`${owner}/${repo}`, provider, cached.result.score, cached.result.verdict, buildUsageCtx(c, startTime, cached.status))
        .then(ue => emitAll(c.env, { usage: [ue] })),
    )
    return {
      body: {
        ...shapeScoringResult(cached.result, includeFlags),
        ...cacheMeta(cached.status, tier, cached.ageSeconds, cached.storedAt, cached.freshUntil, cached.staleUntil),
      },
      headers,
      xCache: cached.status === 'l1-hit' ? 'L1-HIT' : 'L2-HIT',
      status: 200,
    }
  }

  if (cached.status === 'l2-stale' && cached.result) {
    const bgTasks: Promise<unknown>[] = [
      scheduleRevalidation(c.env, c.executionCtx, provider, owner, repo),
      buildUsageEvent(`${owner}/${repo}`, provider, cached.result.score, cached.result.verdict, buildUsageCtx(c, startTime, 'l2-stale'))
        .then(ue => emitAll(c.env, { usage: [ue] })),
    ]
    c.executionCtx.waitUntil(Promise.all(bgTasks))

    return {
      body: {
        ...shapeScoringResult(cached.result, includeFlags),
        ...cacheMeta('l2-stale', tier, cached.ageSeconds, cached.storedAt, cached.freshUntil, cached.staleUntil),
      },
      headers,
      xCache: 'L2-STALE',
      status: 200,
    }
  }

  try {
    const { rawData, result } = await fetchAndScoreProject(c.env, provider, owner, repo)
    const now = new Date().toISOString()
    const bgTasks: Promise<unknown>[] = [
      cacheManager.put(provider, owner, repo, result, tier),
      trackFirstSeen(c.env, provider, owner, repo),
      buildUsageEvent(`${owner}/${repo}`, provider, result.score, result.verdict, buildUsageCtx(c, startTime, 'l3-miss'))
        .then(ue => emitAll(c.env, {
          usage: [ue],
          result: [buildResultEvent(result, 'api')],
          provider: [buildProviderEvent('github', owner, repo, rawData)],
        })),
    ]
    c.executionCtx.waitUntil(Promise.all(bgTasks))

    return {
      body: {
        ...shapeScoringResult(result, includeFlags),
        ...cacheMeta('l3-miss', tier, 0, now, now, now),
      },
      headers,
      xCache: 'L3-MISS',
      status: 200,
    }
  } catch (err: unknown) {
    const errorCode = classifyError(err)
    const statusMap = {
      not_found: 404,
      github_timeout: 504,
      github_rate_limited: 503,
      github_circuit_open: 503,
      upstream_error: 502,
    } as const
    const messageMap: Record<ProviderErrorCode, string> = {
      not_found: 'Project not found',
      github_timeout: 'Upstream timed out',
      github_rate_limited: 'Upstream is rate-limited',
      github_circuit_open: 'Upstream temporarily unavailable',
      upstream_error: 'Failed to fetch project data',
    }
    return {
      body: { error: messageMap[errorCode], error_code: errorCode },
      headers: { 'Cache-Control': 'no-store', 'CDN-Cache-Control': 'no-store' },
      xCache: null,
      status: statusMap[errorCode],
    }
  }
}

packageResolve.get('/:ecosystem', async (c) => {
  const parsed = parsePackageRequest(c)
  if (!parsed.ok) return parsed.response

  const resolved = await resolveDependency(parsed.dep, c.env, c.executionCtx)
  return c.json({
    ecosystem: parsed.ecosystem,
    name: parsed.name,
    version: parsed.version,
    resolution: resolutionPayload(resolved),
  })
})

packageCheck.get('/:ecosystem', async (c) => {
  const startTime = Date.now()
  const parsed = parsePackageRequest(c)
  if (!parsed.ok) return parsed.response

  const resolved = await resolveDependency(parsed.dep, c.env, c.executionCtx)
  const resolution = resolutionPayload(resolved)
  if (!resolved.github) {
    return c.json({
      ecosystem: parsed.ecosystem,
      name: parsed.name,
      version: parsed.version,
      resolution,
      result: null,
    })
  }

  const health = await buildHealthResult(c, resolved.github.owner, resolved.github.repo, startTime)
  const response = c.json({
    ecosystem: parsed.ecosystem,
    name: parsed.name,
    version: parsed.version,
    resolution,
    result: health.body,
  }, health.status as ContentfulStatusCode)

  for (const [name, value] of Object.entries(health.headers)) {
    response.headers.set(name, value)
  }
  if (health.xCache) response.headers.set('X-Cache', health.xCache)

  return response
})

export { packageResolve, packageCheck }
