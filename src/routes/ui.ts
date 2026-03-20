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
import { getCached, putCache, getFirstSeen } from '../cache/index';
import { landingPage } from '../ui/landing';
import { resultPage } from '../ui/result';
import { errorPage } from '../ui/error';
import { methodologyPage } from '../ui/methodology';
import { changelogPage } from '../ui/changelog';
import { verifyTurnstile } from '../middleware/turnstile';
import { getRecentQueries } from '../cache/recentQueries';
import type { CheckEventContext } from '../analytics/events';
import { getTrending, getSitemapRepos } from '../cron/handler';
import { trendingPage } from '../ui/trending';
import type { QueueMessage } from '../queue/types';

const ui = new Hono<{ Bindings: Env }>();

const providers = {
  github: new GitHubProvider(),
};

// Sitemap — dynamic XML based on top repos
ui.get('/sitemap.xml', async (c) => {
  const repos = await getSitemapRepos(c.env.CACHE_KV);
  const baseUrl = 'https://isitalive.dev';
  
  const staticPages = [
    '',
    '/trending',
    '/methodology',
    '/changelog',
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${staticPages.map(page => `  <url>
    <loc>${baseUrl}${page}</loc>
    <changefreq>${page === '' ? 'daily' : 'weekly'}</changefreq>
    <priority>${page === '' ? '1.0' : '0.8'}</priority>
  </url>`).join('\n')}
${repos.map(repo => `  <url>
    <loc>${baseUrl}/${repo}</loc>
    <changefreq>weekly</changefreq>
    <priority>0.6</priority>
  </url>`).join('\n')}
</urlset>`;

  c.header('Content-Type', 'application/xml');
  c.header('Cache-Control', 'public, max-age=3600, s-maxage=3600');
  return c.text(xml);
});

// Landing page — show recent queries
ui.get('/', async (c) => {
  const recent = await getRecentQueries(c.env.CACHE_KV);
  c.header('Cache-Control', 'public, max-age=60, s-maxage=60');
  return c.html(landingPage(c.env.TURNSTILE_SITE_KEY, c.env.CF_ANALYTICS_TOKEN, recent));
});

// Page view beacon — client-side tracking (only real browser page loads)
ui.post('/_view', async (c) => {
  // Origin check — reject requests not from our domain
  const origin = c.req.header('Origin') || c.req.header('Referer') || '';
  if (!origin.includes('isitalive.dev')) {
    return c.json({ ok: false }, 403);
  }

  try {
    const body = await c.req.json() as { r?: string; s?: number; v?: string };
    const repoSlug = body.r;
    if (!repoSlug || typeof repoSlug !== 'string' || !repoSlug.includes('/')) {
      return c.json({ ok: false }, 400);
    }

    const [owner, repo] = repoSlug.split('/');
    const score = typeof body.s === 'number' ? body.s : 0;
    const verdict = typeof body.v === 'string' ? body.v : 'unknown';

    c.executionCtx.waitUntil(
      c.env.EVENTS_QUEUE.send({
        type: 'page-view',
        data: { provider: 'github', owner, repo, score, verdict },
      } satisfies QueueMessage),
    );

    return c.json({ ok: true }, 202);
  } catch {
    return c.json({ ok: false }, 400);
  }
});

// Methodology page — static per deploy
ui.get('/methodology', (c) => {
  c.header('Cache-Control', 'public, max-age=86400, s-maxage=86400');
  return c.html(methodologyPage(c.env.CF_ANALYTICS_TOKEN));
});

// Trending page — static HTML shell (data hydrated client-side)
ui.get('/trending', (c) => {
  c.header('Cache-Control', 'public, max-age=3600, s-maxage=3600');
  return c.html(trendingPage(c.env.CF_ANALYTICS_TOKEN));
});

// Trending API — lightweight JSON endpoint for client-side hydration
ui.get('/api/trending', async (c) => {
  const repos = await getTrending(c.env.CACHE_KV);
  c.header('Cache-Control', 'public, max-age=10, s-maxage=10');
  return c.json(repos);
});

// Changelog page — static per deploy
ui.get('/changelog', (c) => {
  c.header('Cache-Control', 'public, max-age=86400, s-maxage=86400');
  return c.html(changelogPage(c.env.CF_ANALYTICS_TOKEN));
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
  const startTime = Date.now();

  // ─── 1. EDGE CACHE (L1) ──────────────────────────────────────────────────
  const cache = caches.default;
  // Use a pristine request object to avoid poisoning cache with auth headers
  const cacheKey = new Request(c.req.url);

  const cachedResponse = await cache.match(cacheKey);
  if (cachedResponse) {
    console.log(`⚡ Cache HIT for: ${c.req.url}`);
    // Page views are tracked client-side via sendBeacon → /_view
    return cachedResponse;
  }

  console.log(`🐌 Cache MISS. Fetching fresh data for: ${c.req.url}`);

  if (!(provider in providers)) {
    return c.html(errorPage(`Unsupported provider: ${provider}`), 400);
  }

  const analyticsCtx = (): CheckEventContext => ({
    source: 'browser',
    apiKey: 'anon',
    cacheStatus: 'miss',
    responseTimeMs: Date.now() - startTime,
    cf: (c.req.raw as any).cf,
    userAgent: c.req.header('User-Agent') ?? null,
  });

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
            // Archive raw data from background revalidation via queue
            await c.env.EVENTS_QUEUE.send({ type: 'archive-raw', data: {
              provider, owner, repo, rawResponse: rawData._rawResponse,
            }} satisfies QueueMessage);
          } catch {}
        })());
      }
      // Track + analytics via Queue (fire-and-forget)
      const ctx: CheckEventContext = { ...analyticsCtx(), cacheStatus: status };
      c.executionCtx.waitUntil(
        c.env.EVENTS_QUEUE.send({ type: 'recent-query', data: {
            owner, repo, score: cached.score, verdict: cached.verdict, checkedAt: cached.checkedAt,
        }} satisfies QueueMessage).then(() =>
          c.env.EVENTS_QUEUE.send({ type: 'check-event', data: { result: cached, ctx } } satisfies QueueMessage)
        ),
      );
      const firstIndexed = await getFirstSeen(c.env.CACHE_KV, provider, owner, repo);
      const response = c.html(resultPage(cached, owner, repo, c.env.CF_ANALYTICS_TOKEN, firstIndexed));
      c.executionCtx.waitUntil(cache.put(cacheKey, response.clone()));
      return response;
    }

    const prov = providers[provider as keyof typeof providers];
    const rawData = await prov.fetchProject(owner, repo, c.env.GITHUB_TOKEN);
    const result = scoreProject(rawData, prov.name);

    // Cache + queue events (non-blocking)
    const ctx = analyticsCtx();
    c.executionCtx.waitUntil(Promise.all([
      putCache(c.env, provider, owner, repo, result),
      c.env.EVENTS_QUEUE.send({ type: 'first-seen', data: { provider, owner, repo } } satisfies QueueMessage),
      c.env.EVENTS_QUEUE.send({ type: 'recent-query', data: {
        owner, repo, score: result.score, verdict: result.verdict, checkedAt: result.checkedAt,
      }} satisfies QueueMessage),
      c.env.EVENTS_QUEUE.send({ type: 'archive-raw', data: {
        provider, owner, repo, rawResponse: rawData._rawResponse,
      }} satisfies QueueMessage),
      c.env.EVENTS_QUEUE.send({ type: 'check-event', data: { result, ctx } } satisfies QueueMessage),
    ]));

    const firstIndexed = await getFirstSeen(c.env.CACHE_KV, provider, owner, repo);
    
    // 4. Create the Hono response
    c.header('Cache-Control', 'public, max-age=3600, s-maxage=3600');
    const response = c.html(resultPage(result, owner, repo, c.env.CF_ANALYTICS_TOKEN, firstIndexed));

    // 5. Put a CLONED copy into the cache without blocking the user response
    c.executionCtx.waitUntil(cache.put(cacheKey, response.clone()));

    // 6. Return original response
    return response;
  } catch (err: any) {
    c.header('Cache-Control', 'public, max-age=300');
    const isNotFound = err.message?.includes('not found');
    const status = isNotFound ? 404 : 502;
    const message = isNotFound ? 'Project not found' : 'Failed to fetch project data. Please try again later.';
    return c.html(errorPage(message), status);
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
