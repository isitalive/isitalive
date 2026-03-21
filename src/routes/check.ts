// ---------------------------------------------------------------------------
// /api/check/:provider/:owner/:repo — main health check endpoint
// ---------------------------------------------------------------------------

import { Hono } from 'hono';
import type { Env } from '../scoring/types';
import { providers, revalidateInBackground } from '../providers/index';
import { scoreProject } from '../scoring/engine';
import { getCached, putCache, cacheControlHeader, TIERS, type Tier } from '../cache/index';
import type { CheckEventContext } from '../analytics/events';
import type { QueueMessage } from '../queue/types';

type AppEnv = { Bindings: Env; Variables: { tier: Tier; keyName: string | null } };
const check = new Hono<AppEnv>();



/** Build cache metadata for the API response */
function cacheMeta(
  status: string,
  tier: Tier,
  ageSeconds: number | null,
  storedAt: string | null,
  freshUntil: string | null,
  staleUntil: string | null,
) {
  const config = TIERS[tier];
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
  };
}

check.get('/:provider/:owner/:repo', async (c) => {
  const startTime = Date.now();
  const { provider, owner, repo } = c.req.param();

  // ─── 1. EDGE CACHE (L1) ──────────────────────────────────────────────────
  const cache = caches.default;
  const cacheKey = new Request(c.req.url);

  const cachedResponse = await cache.match(cacheKey);
  if (cachedResponse) {
    console.log(`⚡ Cache HIT for: ${c.req.url}`);
    return cachedResponse;
  }

  console.log(`🐌 Cache MISS. Fetching fresh data for: ${c.req.url}`);

  // Validate provider
  if (!Object.hasOwn(providers, provider)) {
    return c.json(
      { error: `Unsupported provider: ${provider}. Supported: ${Object.keys(providers).join(', ')}` },
      400,
    );
  }

  const tier: Tier = c.get('tier') ?? 'free';

  // Build analytics context
  const analyticsCtx = (): CheckEventContext => ({
    source: 'api',
    apiKey: c.get('keyName') ?? 'anon',
    cacheStatus: 'miss',
    responseTimeMs: Date.now() - startTime,
    cf: (c.req.raw as any).cf,
    userAgent: c.req.header('User-Agent') ?? null,
  });

  // ── Check cache ─────────────────────────────────────────────────
  const cached = await getCached(c.env, provider, owner, repo, tier);

  if ((cached.status === 'l1-hit' || cached.status === 'hit') && cached.result) {
    const ctx: CheckEventContext = { ...analyticsCtx(), cacheStatus: cached.status };
    c.executionCtx.waitUntil(
      c.env.EVENTS_QUEUE.send({ type: 'check-event', data: { result: cached.result, ctx } } satisfies QueueMessage),
    );

    const response = c.json({
      ...cached.result,
      ...cacheMeta(cached.status, tier, cached.ageSeconds, cached.storedAt, cached.freshUntil, cached.staleUntil),
    });

    response.headers.set('Cache-Control', cacheControlHeader(tier));
    response.headers.set('X-Cache', cached.status === 'l1-hit' ? 'L1-HIT' : 'HIT');

    c.executionCtx.waitUntil(cache.put(cacheKey, response.clone()));
    return response;
  }

  if (cached.status === 'stale' && cached.result) {
    const ctx: CheckEventContext = { ...analyticsCtx(), cacheStatus: 'stale' };
    c.executionCtx.waitUntil(Promise.all([
      revalidateInBackground(c.env, provider, owner, repo, c.env.EVENTS_QUEUE),
      c.env.EVENTS_QUEUE.send({ type: 'check-event', data: { result: cached.result, ctx } } satisfies QueueMessage),
    ]));

    const response = c.json({
      ...cached.result,
      ...cacheMeta('stale', tier, cached.ageSeconds, cached.storedAt, cached.freshUntil, cached.staleUntil),
    });

    response.headers.set('Cache-Control', cacheControlHeader(tier));
    response.headers.set('X-Cache', 'STALE');

    c.executionCtx.waitUntil(cache.put(cacheKey, response.clone()));
    return response;
  }

  // ── Cache miss — fetch synchronously ────────────────────────────
  try {
    const prov = providers[provider as keyof typeof providers];
    const rawData = await prov.fetchProject(owner, repo, c.env.GITHUB_TOKEN);
    const result = scoreProject(rawData, prov.name);

    const ctx = analyticsCtx();
    c.executionCtx.waitUntil(Promise.all([
      putCache(c.env, provider, owner, repo, result),
      c.env.EVENTS_QUEUE.send({ type: 'archive-raw', data: {
        provider, owner, repo, rawResponse: rawData._rawResponse,
      }} satisfies QueueMessage),
      c.env.EVENTS_QUEUE.send({ type: 'check-event', data: { result, ctx } } satisfies QueueMessage),
      c.env.EVENTS_QUEUE.send({ type: 'first-seen', data: { provider, owner, repo } } satisfies QueueMessage),
    ]));

    const now = new Date().toISOString();
    
    const response = c.json({
      ...result,
      ...cacheMeta('miss', tier, 0, now, now, now),
    });

    response.headers.set('Cache-Control', cacheControlHeader(tier));
    response.headers.set('X-Cache', 'MISS');

    c.executionCtx.waitUntil(cache.put(cacheKey, response.clone()));

    return response;
  } catch (err: any) {
    const status = err.message?.includes('not found') ? 404 : 502;
    const message = status === 404 ? 'Project not found' : 'Failed to fetch project data';
    return c.json({ error: message }, status);
  }
});

export { check };
