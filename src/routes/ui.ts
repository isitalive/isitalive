// ---------------------------------------------------------------------------
// Web UI routes — landing page and result pages
// ---------------------------------------------------------------------------

import { Hono } from 'hono';
import type { Env } from '../scoring/types';
import { GitHubProvider } from '../providers/github';
import { scoreProject } from '../scoring/engine';
import { getCached, putCache } from '../cache/index';
import { landingPage } from '../ui/landing';
import { resultPage } from '../ui/result';
import { errorPage } from '../ui/error';

const ui = new Hono<{ Bindings: Env }>();

const providers = {
  github: new GitHubProvider(),
};

// Landing page
ui.get('/', (c) => {
  return c.html(landingPage());
});

// Shared handler for fetching + rendering a result page
async function handleCheck(c: any, provider: string, owner: string, repo: string) {
  if (!(provider in providers)) {
    return c.html(errorPage(`Unsupported provider: ${provider}`), 400);
  }

  try {
    const { result: cached, status } = await getCached(c.env, provider, owner, repo);

    if (cached && (status === 'hit' || status === 'stale')) {
      if (status === 'stale') {
        // Serve stale page, revalidate in background
        c.executionCtx.waitUntil((async () => {
          try {
            const prov = providers[provider as keyof typeof providers];
            const rawData = await prov.fetchProject(owner, repo, c.env.GITHUB_TOKEN);
            const fresh = scoreProject(rawData, prov.name);
            await putCache(c.env, provider, owner, repo, fresh);
          } catch {}
        })());
      }
      return c.html(resultPage(cached, owner, repo));
    }

    const prov = providers[provider as keyof typeof providers];
    const rawData = await prov.fetchProject(owner, repo, c.env.GITHUB_TOKEN);
    const result = scoreProject(rawData, prov.name);
    c.executionCtx.waitUntil(putCache(c.env, provider, owner, repo, result));

    return c.html(resultPage(result, owner, repo));
  } catch (err: any) {
    return c.html(errorPage(err.message), err.message?.includes('not found') ? 404 : 502);
  }
}

// Shortcut: /owner/repo → defaults to GitHub (e.g. isitalive.dev/zitadel/zitadel)
ui.get('/:owner/:repo', async (c) => {
  const { owner, repo } = c.req.param();
  return handleCheck(c, 'github', owner, repo);
});

// Explicit provider: /github/owner/repo
ui.get('/:provider/:owner/:repo', async (c) => {
  const { provider, owner, repo } = c.req.param();
  return handleCheck(c, provider, owner, repo);
});

export { ui };
