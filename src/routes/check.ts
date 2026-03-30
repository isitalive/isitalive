// ---------------------------------------------------------------------------
// /api/check/:provider/:owner/:repo — main health check endpoint
// ---------------------------------------------------------------------------

import { Hono } from 'hono'
import type { Env } from '../scoring/types'
import { providers, fetchAndScoreProject, scheduleRevalidation } from '../providers/index'
import { CacheManager, cacheControlHeaders, TIERS, type Tier, trackFirstSeen } from '../cache/index'
import { isValidParam } from '../utils/validate'
import { buildResultEvent } from '../events/result'
import { buildUsageEvent, type UsageContext } from '../events/usage'
import { buildProviderEvent } from '../events/provider'
import { emitAll } from '../pipeline/emit'
import { parseIncludeFlags, shapeScoringResult } from '../utils/healthResponse'

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



check.get('/:provider/:owner/:repo', async (c) => {
  const startTime = Date.now()
  const includeFlags = parseIncludeFlags(c.req.url)
  const { provider, owner: rawOwner, repo: rawRepo } = c.req.param()

  // Validate path params — blocks XSS / path-traversal payloads
  if (!isValidParam(rawOwner) || !isValidParam(rawRepo)) {
    return c.json({ error: 'Invalid owner or repo name' }, 400)
  }

  // Normalize to lowercase — GitHub is case-insensitive
  const owner = rawOwner.toLowerCase()
  const repo = rawRepo.toLowerCase()

  // ─── 1. EDGE CACHE (L1) ──────────────────────────────────────────────────
  // Only use response-cache fast path for anonymous requests.
  // Authenticated requests must always reach the Worker for metering.
  const cacheManager = new CacheManager(c.env, c.executionCtx)
  const cacheKey = new Request(c.req.url)
  const isAuthenticated = c.get('isAuthenticated') ?? false

  const cachedResponse = await cacheManager.getResponse(cacheKey, isAuthenticated)
  if (cachedResponse) {
    // Track L1 response cache hit for operational visibility
    c.executionCtx.waitUntil(
      buildUsageEvent(`${owner}/${repo}`, provider, 0, '', {
        source: 'api', apiKey: c.get('keyName') ?? 'anon', cacheStatus: 'l1-hit',
        responseTimeMs: Date.now() - startTime,
        cf: (c.req.raw as any).cf, userAgent: c.req.header('User-Agent') ?? null, ip: null,
      }).then(ue => emitAll(c.env, { usage: [ue] })),
    )
    return cachedResponse
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
  const cached = await cacheManager.get(provider, owner, repo, tier)

  if ((cached.status === 'l1-hit' || cached.status === 'l2-hit') && cached.result) {
    // Emit usage event for all requests (operational visibility)
    const usageCtx = buildUsageCtx(cached.status)
    c.executionCtx.waitUntil(
      buildUsageEvent(`${owner}/${repo}`, provider, cached.result.score, cached.result.verdict, usageCtx)
        .then(ue => emitAll(c.env, { usage: [ue], result: [buildResultEvent(cached.result!, 'api')] })),
    )

    const response = c.json({
      ...shapeScoringResult(cached.result, includeFlags),
      ...cacheMeta(cached.status, tier, cached.ageSeconds, cached.storedAt, cached.freshUntil, cached.staleUntil),
    })

    response.headers.set('Cache-Control', headers['Cache-Control'])
    response.headers.set('CDN-Cache-Control', headers['CDN-Cache-Control'])
    response.headers.set('X-Cache', cached.status === 'l1-hit' ? 'L1-HIT' : 'L2-HIT')

    c.executionCtx.waitUntil(cacheManager.putResponse(cacheKey, response))
    return response
  }

  if (cached.status === 'l2-stale' && cached.result) {
    const bgTasks: Promise<unknown>[] = [
      scheduleRevalidation(c.env, c.executionCtx, provider, owner, repo),
    ]

    // Emit usage event for all requests
    const usageCtx = buildUsageCtx('l2-stale')
    bgTasks.push(
      buildUsageEvent(`${owner}/${repo}`, provider, cached.result.score, cached.result.verdict, usageCtx)
        .then(ue => emitAll(c.env, { usage: [ue], result: [buildResultEvent(cached.result!, 'api')] })),
    )

    c.executionCtx.waitUntil(Promise.all(bgTasks))

    const response = c.json({
      ...shapeScoringResult(cached.result, includeFlags),
      ...cacheMeta('l2-stale', tier, cached.ageSeconds, cached.storedAt, cached.freshUntil, cached.staleUntil),
    })

    response.headers.set('Cache-Control', headers['Cache-Control'])
    response.headers.set('CDN-Cache-Control', headers['CDN-Cache-Control'])
    response.headers.set('X-Cache', 'L2-STALE')

    c.executionCtx.waitUntil(cacheManager.putResponse(cacheKey, response))
    return response
  }

  // ── Cache miss — fetch synchronously ────────────────────────────
  try {
    const { rawData, result } = await fetchAndScoreProject(c.env, provider, owner, repo)

    const bgTasks: Promise<unknown>[] = [
      cacheManager.put(provider, owner, repo, result, tier),
      trackFirstSeen(c.env.CACHE_KV, provider, owner, repo),
    ]

    // Always emit result/provider events on cache miss (powers trending + data freshness)
    const resultEvents = {
      result: [buildResultEvent(result, 'api')],
      provider: [buildProviderEvent('github', owner, repo, rawData)],
    }

    // Emit usage + result/provider events for all requests
    const usageCtx = buildUsageCtx('l3-miss')
    bgTasks.push(
      buildUsageEvent(`${owner}/${repo}`, provider, result.score, result.verdict, usageCtx)
        .then(ue => emitAll(c.env, { usage: [ue], ...resultEvents })),
    )

    c.executionCtx.waitUntil(Promise.all(bgTasks))

    const now = new Date().toISOString()
    
    const response = c.json({
      ...shapeScoringResult(result, includeFlags),
      ...cacheMeta('l3-miss', tier, 0, now, now, now),
    })

    response.headers.set('Cache-Control', headers['Cache-Control'])
    response.headers.set('CDN-Cache-Control', headers['CDN-Cache-Control'])
    response.headers.set('X-Cache', 'L3-MISS')

    c.executionCtx.waitUntil(cacheManager.putResponse(cacheKey, response))

    return response
  } catch (err: any) {
    const status = err.message?.includes('not found') ? 404 : 502
    const message = status === 404 ? 'Project not found' : 'Failed to fetch project data'
    return c.json({ error: message }, status)
  }
})

export { check }
