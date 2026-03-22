// ---------------------------------------------------------------------------
// /api/check/:provider/:owner/:repo — main health check endpoint
// ---------------------------------------------------------------------------

import { Hono } from 'hono'
import type { Env } from '../scoring/types'
import { providers, revalidateInBackground } from '../providers/index'
import { scoreProject } from '../scoring/engine'
import { getCached, putCache, cacheControlHeaders, TIERS, type Tier } from '../cache/index'
import { buildResultEvent } from '../events/result'
import { buildUsageEvent, type UsageContext } from '../events/usage'
import { buildProviderEvent } from '../events/provider'
import { emitAll } from '../pipeline/emit'

type AppEnv = { Bindings: Env; Variables: { tier: Tier; keyName: string | null; isAuthenticated: boolean } }
const check = new Hono<AppEnv>()



/** Build cache metadata for the API response */
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

/** Validate path params — only allow valid GitHub-style identifiers */
function isValidParam(value: string): boolean {
  return /^[a-zA-Z0-9._-]+$/.test(value) && value.length <= 100
}

check.get('/:provider/:owner/:repo', async (c) => {
  const startTime = Date.now()
  const { provider, owner, repo } = c.req.param()

  // Validate path params — blocks XSS / path-traversal payloads
  if (!isValidParam(owner) || !isValidParam(repo)) {
    return c.json({ error: 'Invalid owner or repo name' }, 400)
  }

  // ─── 1. EDGE CACHE (L1) ──────────────────────────────────────────────────
  // Only use response-cache fast path for anonymous requests.
  // Authenticated requests must always reach the Worker for metering.
  const cache = caches.default
  const cacheKey = new Request(c.req.url)
  const isAuthenticated = c.get('isAuthenticated') ?? false

  if (!isAuthenticated) {
    const cachedResponse = await cache.match(cacheKey)
    if (cachedResponse) {
      console.log(`⚡ Cache HIT for: ${c.req.url}`)
      return cachedResponse
    }
  }

  console.log(`🐌 Cache MISS. Fetching fresh data for: ${c.req.url}`)

  // Validate provider
  if (!Object.hasOwn(providers, provider)) {
    return c.json(
      { error: `Unsupported provider: ${provider}. Supported: ${Object.keys(providers).join(', ')}` },
      400,
    )
  }

  const tier: Tier = c.get('tier') ?? 'free'

  const headers = cacheControlHeaders(tier, isAuthenticated)

  const buildUsageCtx = (cacheStatus: string): UsageContext => ({
    source: 'api',
    apiKey: c.get('keyName') ?? 'anon',
    cacheStatus,
    responseTimeMs: Date.now() - startTime,
    cf: (c.req.raw as any).cf,
    userAgent: c.req.header('User-Agent') ?? null,
    ip: null,
  })

  // ── Check cache ─────────────────────────────────────────────────
  const cached = await getCached(c.env, provider, owner, repo, tier)

  if ((cached.status === 'l1-hit' || cached.status === 'hit') && cached.result) {
    // Usage events only for authenticated requests (billing/metering)
    if (isAuthenticated) {
      const usageCtx = buildUsageCtx(cached.status)
      c.executionCtx.waitUntil(
        buildUsageEvent(`${owner}/${repo}`, provider, cached.result.score, cached.result.verdict, usageCtx)
          .then(ue => emitAll(c.env, { usage: [ue], result: [buildResultEvent(cached.result!, 'api')] })),
      )
    }

    const response = c.json({
      ...cached.result,
      ...cacheMeta(cached.status, tier, cached.ageSeconds, cached.storedAt, cached.freshUntil, cached.staleUntil),
    })

    response.headers.set('Cache-Control', headers['Cache-Control'])
    response.headers.set('CDN-Cache-Control', headers['CDN-Cache-Control'])
    response.headers.set('X-Cache', cached.status === 'l1-hit' ? 'L1-HIT' : 'HIT')

    c.executionCtx.waitUntil(cache.put(cacheKey, response.clone()))
    return response
  }

  if (cached.status === 'stale' && cached.result) {
    const bgTasks: Promise<unknown>[] = [
      revalidateInBackground(c.env, provider, owner, repo),
    ]

    // Usage events only for authenticated requests
    if (isAuthenticated) {
      const usageCtx = buildUsageCtx('stale')
      bgTasks.push(
        buildUsageEvent(`${owner}/${repo}`, provider, cached.result.score, cached.result.verdict, usageCtx)
          .then(ue => emitAll(c.env, { usage: [ue], result: [buildResultEvent(cached.result!, 'api')] })),
      )
    }

    c.executionCtx.waitUntil(Promise.all(bgTasks))

    const response = c.json({
      ...cached.result,
      ...cacheMeta('stale', tier, cached.ageSeconds, cached.storedAt, cached.freshUntil, cached.staleUntil),
    })

    response.headers.set('Cache-Control', headers['Cache-Control'])
    response.headers.set('CDN-Cache-Control', headers['CDN-Cache-Control'])
    response.headers.set('X-Cache', 'STALE')

    c.executionCtx.waitUntil(cache.put(cacheKey, response.clone()))
    return response
  }

  // ── Cache miss — fetch synchronously ────────────────────────────
  try {
    const prov = providers[provider as keyof typeof providers]
    const rawData = await prov.fetchProject(owner, repo, c.env.GITHUB_TOKEN)
    const result = scoreProject(rawData, prov.name)

    const bgTasks: Promise<unknown>[] = [
      putCache(c.env, provider, owner, repo, result),
    ]

    // Always emit result/provider events on cache miss (powers trending + data freshness)
    const resultEvents = {
      result: [buildResultEvent(result, 'api')],
      provider: [buildProviderEvent('github', owner, repo, rawData._rawResponse)],
    }

    // Usage events only for authenticated requests (billing/metering)
    if (isAuthenticated) {
      const usageCtx = buildUsageCtx('miss')
      bgTasks.push(
        buildUsageEvent(`${owner}/${repo}`, provider, result.score, result.verdict, usageCtx)
          .then(ue => emitAll(c.env, { usage: [ue], ...resultEvents })),
      )
    } else {
      // Anonymous: emit result/provider events only (no usage)
      bgTasks.push(emitAll(c.env, resultEvents))
    }

    c.executionCtx.waitUntil(Promise.all(bgTasks))

    const now = new Date().toISOString()
    
    const response = c.json({
      ...result,
      ...cacheMeta('miss', tier, 0, now, now, now),
    })

    response.headers.set('Cache-Control', headers['Cache-Control'])
    response.headers.set('CDN-Cache-Control', headers['CDN-Cache-Control'])
    response.headers.set('X-Cache', 'MISS')

    c.executionCtx.waitUntil(cache.put(cacheKey, response.clone()))

    return response
  } catch (err: any) {
    const status = err.message?.includes('not found') ? 404 : 502
    const message = status === 404 ? 'Project not found' : 'Failed to fetch project data'
    return c.json({ error: message }, status)
  }
})

export { check }
