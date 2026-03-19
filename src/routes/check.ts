// ---------------------------------------------------------------------------
// /api/check/:provider/:owner/:repo — main health check endpoint
// ---------------------------------------------------------------------------

import { Hono } from 'hono';
import type { Env } from '../scoring/types';
import { GitHubProvider } from '../providers/github';
import { scoreProject } from '../scoring/engine';
import { getCached, putCache, cacheControlHeader } from '../cache/index';

const check = new Hono<{ Bindings: Env }>();

const providers = {
  github: new GitHubProvider(),
};

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

  // ── Check cache first ───────────────────────────────────────────
  const cached = await getCached(c.env, provider, owner, repo);
  if (cached) {
    c.header('Cache-Control', cacheControlHeader(isPaid));
    return c.json(cached);
  }

  // ── Fetch fresh data ────────────────────────────────────────────
  try {
    const prov = providers[provider as keyof typeof providers];
    const rawData = await prov.fetchProject(owner, repo, c.env.GITHUB_TOKEN);
    const result = scoreProject(rawData, prov.name);

    // Write to cache
    await putCache(c.env, provider, owner, repo, result, isPaid);

    c.header('Cache-Control', cacheControlHeader(isPaid));
    return c.json(result);
  } catch (err: any) {
    const status = err.message?.includes('not found') ? 404 : 502;
    return c.json({ error: err.message }, status);
  }
});

export { check };
