// ---------------------------------------------------------------------------
// Web UI routes — landing page and result pages
//
// Turnstile protects the search form submission (POST /_check).
// Direct URL visits (GET /:owner/:repo) are not gated — they're shareable
// links and always hit cache. The POST form submission is what triggers
// fresh GitHub API calls.
// ---------------------------------------------------------------------------

import { Hono } from 'hono';
import type { Env } from '../scoring/types';
import { GitHubProvider } from '../providers/github';
import { scoreProject } from '../scoring/engine';
import { getCached, putCache } from '../cache/index';
import { landingPage } from '../ui/landing';
import { resultPage } from '../ui/result';
import { errorPage } from '../ui/error';
import { methodologyPage } from '../ui/methodology';
import { verifyTurnstile } from '../middleware/turnstile';

const ui = new Hono<{ Bindings: Env }>();

const providers = {
  github: new GitHubProvider(),
};

// Landing page
ui.get('/', (c) => {
  c.header('Cache-Control', 'public, max-age=3600, s-maxage=3600');
  return c.html(landingPage(c.env.TURNSTILE_SITE_KEY, c.env.CF_ANALYTICS_TOKEN));
});

// Methodology page — static per deploy
ui.get('/methodology', (c) => {
  c.header('Cache-Control', 'public, max-age=86400, s-maxage=86400');
  return c.html(methodologyPage(c.env.CF_ANALYTICS_TOKEN));
});

// POST /_check — form submission with Turnstile verification
// This redirects to the result page after verifying the human
ui.post('/_check', verifyTurnstile, async (c) => {
  // Body already parsed by turnstile middleware — use the stored copy
  const body = (c as any).get('parsedBody') ?? await c.req.parseBody();
  const input = (body['repo'] as string || '').trim();

  if (!input) {
    return c.redirect('/');
  }

  // Parse input: "owner/repo", "github.com/owner/repo", or full URL
  let path = input
    .replace(/^https?:\/\//, '')
    .replace(/^(www\.)?github\.com\//, '')
    .replace(/\.git$/, '')
    .replace(/\/+$/, '');

  const parts = path.split('/');
  if (parts.length >= 2) {
    return c.redirect(`/${parts[0]}/${parts[1]}`);
  }

  return c.redirect('/');
});

// Shared handler for fetching + rendering a result page
async function handleCheck(c: any, provider: string, owner: string, repo: string) {
  if (!(provider in providers)) {
    return c.html(errorPage(`Unsupported provider: ${provider}`), 400);
  }

  try {
    const { result: cached, status } = await getCached(c.env, provider, owner, repo);

    if (cached && (status === 'l1-hit' || status === 'hit' || status === 'stale')) {
      if (status === 'stale') {
        c.executionCtx.waitUntil((async () => {
          try {
            const prov = providers[provider as keyof typeof providers];
            const rawData = await prov.fetchProject(owner, repo, c.env.GITHUB_TOKEN);
            const fresh = scoreProject(rawData, prov.name);
            await putCache(c.env, provider, owner, repo, fresh);
          } catch {}
        })());
      }
      return c.html(resultPage(cached, owner, repo, c.env.CF_ANALYTICS_TOKEN));
    }

    const prov = providers[provider as keyof typeof providers];
    const rawData = await prov.fetchProject(owner, repo, c.env.GITHUB_TOKEN);
    const result = scoreProject(rawData, prov.name);
    c.executionCtx.waitUntil(putCache(c.env, provider, owner, repo, result));

    c.header('Cache-Control', 'public, max-age=3600, s-maxage=3600');
    return c.html(resultPage(result, owner, repo, c.env.CF_ANALYTICS_TOKEN));
  } catch (err: any) {
    c.header('Cache-Control', 'public, max-age=300');
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
