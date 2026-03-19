// ---------------------------------------------------------------------------
// /api/check/:provider/:owner/:repo — main health check endpoint
// ---------------------------------------------------------------------------

import { Hono } from 'hono';
import type { Env } from '../scoring/types';
import { GitHubProvider } from '../providers/github';
import { scoreProject } from '../scoring/engine';
import { getCached, putCache, cacheControlHeader, type Tier } from '../cache/index';

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

check.get('/:provider/:owner/:repo', async (c) => {
  const { provider, owner, repo } = c.req.param();

  // Validate provider
  if (!(provider in providers)) {
    return c.json(
      { error: `Unsupported provider: ${provider}. Supported: ${Object.keys(providers).join(', ')}` },
      400,
    );
  }

  const isPaid = !!(c.get as any)('isPaid');
  const tier: Tier = isPaid ? 'pro' : 'free'; // TODO: distinguish pro vs enterprise

  // ── Check cache ─────────────────────────────────────────────────
  const { result: cached, status } = await getCached(c.env, provider, owner, repo, tier);

  if ((status === 'l1-hit' || status === 'hit') && cached) {
    // Fresh cache — serve directly
    c.header('Cache-Control', cacheControlHeader(tier));
    c.header('X-Cache', status === 'l1-hit' ? 'L1-HIT' : 'HIT');
    return c.json(cached);
  }

  if (status === 'stale' && cached) {
    // Stale — serve immediately, revalidate in background
    c.executionCtx.waitUntil(revalidate(c.env, provider, owner, repo));
    c.header('Cache-Control', cacheControlHeader(tier));
    c.header('X-Cache', 'STALE');
    return c.json(cached);
  }

  // ── Cache miss — fetch synchronously ────────────────────────────
  try {
    const prov = providers[provider as keyof typeof providers];
    const rawData = await prov.fetchProject(owner, repo, c.env.GITHUB_TOKEN);
    const result = scoreProject(rawData, prov.name);

    // Write to cache (non-blocking)
    c.executionCtx.waitUntil(putCache(c.env, provider, owner, repo, result));

    c.header('Cache-Control', cacheControlHeader(tier));
    c.header('X-Cache', 'MISS');
    return c.json(result);
  } catch (err: any) {
    const status = err.message?.includes('not found') ? 404 : 502;
    return c.json({ error: err.message }, status);
  }
});

export { check };
