// ---------------------------------------------------------------------------
// /api/check/:provider/:owner/:repo — main health check endpoint
// ---------------------------------------------------------------------------

import { Hono } from 'hono';
import type { Env } from '../scoring/types';
import { GitHubProvider } from '../providers/github';
import { scoreProject } from '../scoring/engine';
import { getCached, putCache, cacheControlHeader, TIERS, type Tier } from '../cache/index';
import { sendCheckEvent, archiveRawData, type CheckEventContext } from '../analytics/events';

const check = new Hono<{ Bindings: Env }>();

const providers = {
  github: new GitHubProvider(),
};

/** Background revalidation — fetches fresh data and updates KV */
async function revalidate(
  env: Env,
  provider: string,
  owner: string,
  repo: string,
): Promise<void> {
  try {
    const prov = providers[provider as keyof typeof providers];
    if (!prov) return;
    const rawData = await prov.fetchProject(owner, repo, env.GITHUB_TOKEN);
    const result = scoreProject(rawData, prov.name);
    await putCache(env, provider, owner, repo, result);
  } catch {
    // Silently fail — stale data is still being served
  }
}

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

  // Validate provider
  if (!(provider in providers)) {
    return c.json(
      { error: `Unsupported provider: ${provider}. Supported: ${Object.keys(providers).join(', ')}` },
      400,
    );
  }

  // Tier is set by auth middleware via c.set('tier', ...)
  // Use type assertion to bypass Hono's strict generics
  const vars = c as any;
  const tier: Tier = vars.get('tier') ?? 'free';

  // ── Check cache ─────────────────────────────────────────────────
  const cached = await getCached(c.env, provider, owner, repo, tier);

  if ((cached.status === 'l1-hit' || cached.status === 'hit') && cached.result) {
    // Analytics — WAE event for cache hit
    const ctx: CheckEventContext = {
      source: 'api', apiKey: vars.get('apiKeyName') ?? 'anon',
      cacheStatus: cached.status, responseTimeMs: Date.now() - startTime,
      cf: (c.req.raw as any).cf, userAgent: c.req.header('User-Agent') ?? null,
    };
    c.executionCtx.waitUntil(sendCheckEvent(c.env, cached.result, ctx));

    c.header('Cache-Control', cacheControlHeader(tier));
    c.header('X-Cache', cached.status === 'l1-hit' ? 'L1-HIT' : 'HIT');
    return c.json({
      ...cached.result,
      ...cacheMeta(cached.status, tier, cached.ageSeconds, cached.storedAt, cached.freshUntil, cached.staleUntil),
    });
  }

  if (cached.status === 'stale' && cached.result) {
    const ctx: CheckEventContext = {
      source: 'api', apiKey: vars.get('apiKeyName') ?? 'anon',
      cacheStatus: 'stale', responseTimeMs: Date.now() - startTime,
      cf: (c.req.raw as any).cf, userAgent: c.req.header('User-Agent') ?? null,
    };
    c.executionCtx.waitUntil(Promise.all([
      revalidate(c.env, provider, owner, repo),
      sendCheckEvent(c.env, cached.result, ctx),
    ]));
    c.header('Cache-Control', cacheControlHeader(tier));
    c.header('X-Cache', 'STALE');
    return c.json({
      ...cached.result,
      ...cacheMeta('stale', tier, cached.ageSeconds, cached.storedAt, cached.freshUntil, cached.staleUntil),
    });
  }

  // ── Cache miss — fetch synchronously ────────────────────────────
  try {
    const prov = providers[provider as keyof typeof providers];
    const rawData = await prov.fetchProject(owner, repo, c.env.GITHUB_TOKEN);
    const result = scoreProject(rawData, prov.name);

    // Analytics — WAE + R2 on fresh fetch
    const ctx: CheckEventContext = {
      source: 'api', apiKey: vars.get('apiKeyName') ?? 'anon',
      cacheStatus: 'miss', responseTimeMs: Date.now() - startTime,
      cf: (c.req.raw as any).cf, userAgent: c.req.header('User-Agent') ?? null,
    };
    c.executionCtx.waitUntil(Promise.all([
      putCache(c.env, provider, owner, repo, result),
      archiveRawData(c.env, provider, owner, repo, rawData._rawResponse),
      sendCheckEvent(c.env, result, ctx),
    ]));

    const now = new Date().toISOString();
    c.header('Cache-Control', cacheControlHeader(tier));
    c.header('X-Cache', 'MISS');
    return c.json({
      ...result,
      ...cacheMeta('miss', tier, 0, now, now, now),
    });
  } catch (err: any) {
    const status = err.message?.includes('not found') ? 404 : 502;
    return c.json({ error: err.message }, status);
  }
});

export { check };
