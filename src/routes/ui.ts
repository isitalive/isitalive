// ---------------------------------------------------------------------------
// Web UI routes — landing page and result pages
//
// Turnstile protects the search form submission (POST /_check).
// Direct URL visits (GET /:owner/:repo) are not gated — they're shareable
// links and always hit cache. The POST form submission is what triggers
// fresh GitHub API calls.
// ---------------------------------------------------------------------------

import { Hono } from 'hono'
import type { Env } from '../scoring/types'
import { providers, revalidateInBackground } from '../providers/index'
import { scoreProject } from '../scoring/engine'
import { getCached, putCache, getFirstSeen } from '../cache/index'
import { landingPage } from '../ui/landing'
import { resultPage } from '../ui/result'
import { errorPage } from '../ui/error'
import { methodologyPage } from '../ui/methodology'
import { termsPage } from '../ui/terms'
import { changelogPage } from '../ui/changelog'
import { verifyTurnstile } from '../middleware/turnstile'
import { getRecentQueries, trackRecentQuery } from '../cache/recentQueries'
import { getTrending, getSitemapRepos } from '../cron/handler'
import { trendingPage } from '../ui/trending'
import { parseChangelog as parseChangelogMd } from '../changelog/parser'
import changelogMd from '../../CHANGELOG.md'
import { getScoreHistory, computeTrend } from '../ingest/processor'
import { apiDocsPage } from '../ui/api-docs'
import { buildPageViewUsageEvent, buildUsageEvent, type UsageContext } from '../events/usage'
import { buildResultEvent } from '../events/result'
import { buildProviderEvent } from '../events/provider'
import { emitAll } from '../pipeline/emit'

const ui = new Hono<{ Bindings: Env }>()



const allowedViewHosts = new Set(['isitalive.dev', 'www.isitalive.dev', 'localhost', '127.0.0.1', '[::1]'])

function hasAllowedViewOrigin(originHeader: string): boolean {
  if (!originHeader) {
    return false
  }

  try {
    const { hostname } = new URL(originHeader)
    return allowedViewHosts.has(hostname)
  } catch {
    return false
  }
}

// Sitemap — dynamic XML based on top repos
ui.get('/sitemap.xml', async (c) => {
  const repos = await getSitemapRepos(c.env.CACHE_KV)
  const baseUrl = 'https://isitalive.dev'
  
  const staticPages = [
    '',
    '/trending',
    '/api',
    '/methodology',
    '/changelog',
    '/terms',
  ]

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${staticPages.map(page => `  <url>
    <loc>${baseUrl}${page}</loc>
    <changefreq>${page === '' ? 'daily' : 'weekly'}</changefreq>
    <priority>${page === '' ? '1.0' : '0.8'}</priority>
  </url>`).join('\n')}
${repos.map(repo => `  <url>
    <loc>${baseUrl}/github/${repo}</loc>
    <changefreq>weekly</changefreq>
    <priority>0.6</priority>
  </url>`).join('\n')}
</urlset>`

  c.header('Content-Type', 'application/xml')
  c.header('Cache-Control', 'public, max-age=3600, s-maxage=3600')
  return c.text(xml)
})

// Landing page — static shell, chips hydrated client-side
ui.get('/', (c) => {
  c.header('Cache-Control', 'public, max-age=3600, s-maxage=3600')
  return c.html(landingPage(c.env.TURNSTILE_SITE_KEY, c.env.CF_ANALYTICS_TOKEN))
})

// Recent queries API — lightweight JSON for client-side hydration
ui.get('/api/recent', async (c) => {
  const recent = await getRecentQueries(c.env.CACHE_KV)
  c.header('Cache-Control', 'public, max-age=10, s-maxage=10')
  return c.json(recent)
})

// Page view beacon — client-side tracking (only real browser page loads)
ui.post('/_view', async (c) => {
  // Origin check — reject requests not from our domain
  const origin = c.req.header('Origin') || c.req.header('Referer') || ''
  if (!hasAllowedViewOrigin(origin)) {
    return c.json({ ok: false }, 403)
  }

  try {
    const body = await c.req.json() as { r?: string; s?: number; v?: string }
    const repoSlug = body.r
    if (!repoSlug || typeof repoSlug !== 'string' || !repoSlug.includes('/')) {
      return c.json({ ok: false }, 400)
    }

    const [owner, repo] = repoSlug.split('/')
    const score = typeof body.s === 'number' ? body.s : 0
    const verdict = typeof body.v === 'string' ? body.v : 'unknown'

    // Pipeline: usage event for page view
    c.executionCtx.waitUntil(
      emitAll(c.env, { usage: [buildPageViewUsageEvent('github', owner, repo, score, verdict)] }),
    )

    return c.json({ ok: true }, 202)
  } catch {
    return c.json({ ok: false }, 400)
  }
})

// Methodology page — static per deploy
ui.get('/methodology', (c) => {
  c.header('Cache-Control', 'public, max-age=86400, s-maxage=86400')
  return c.html(methodologyPage(c.env.CF_ANALYTICS_TOKEN))
})

// API docs page
ui.get('/api', (c) => {
  c.header('Cache-Control', 'public, max-age=86400, s-maxage=86400')
  return c.html(apiDocsPage(c.env.CF_ANALYTICS_TOKEN))
})

// Terms of Service page — static per deploy
ui.get('/terms', (c) => {
  c.header('Cache-Control', 'public, max-age=86400, s-maxage=86400')
  return c.html(termsPage(c.env.CF_ANALYTICS_TOKEN))
})

// Trending page — static HTML shell (data hydrated client-side)
ui.get('/trending', (c) => {
  c.header('Cache-Control', 'public, max-age=3600, s-maxage=3600')
  return c.html(trendingPage(c.env.CF_ANALYTICS_TOKEN))
})

// Trending API — paginated JSON endpoint for client-side hydration
ui.get('/api/trending', async (c) => {
  const allRepos = await getTrending(c.env.CACHE_KV)
  const limit = Math.max(1, parseInt(c.req.query('limit') || '20', 10))
  const offset = Math.max(0, parseInt(c.req.query('offset') || '0', 10))
  const page = allRepos.slice(offset, offset + limit)
  c.header('Cache-Control', 'public, max-age=10, s-maxage=10')
  return c.json({
    repos: page,
    total: allRepos.length,
    offset,
    limit,
    hasMore: offset + limit < allRepos.length,
  })
})

// Changelog page — static HTML shell (data hydrated client-side)
ui.get('/changelog', (c) => {
  c.header('Cache-Control', 'public, max-age=3600, s-maxage=3600')
  return c.html(changelogPage(c.env.CF_ANALYTICS_TOKEN))
})

// Changelog API — paginated JSON endpoint
ui.get('/api/changelog', (c) => {
  const page = Math.max(1, parseInt(c.req.query('page') || '1', 10))
  const limit = Math.min(20, Math.max(1, parseInt(c.req.query('limit') || '5', 10)))

  const all = parseChangelogMd(changelogMd)
  const start = (page - 1) * limit
  const versions = all.slice(start, start + limit)
  const hasMore = start + limit < all.length

  c.header('Cache-Control', 'public, max-age=3600, s-maxage=3600')
  return c.json({ versions, page, hasMore, total: all.length })
})

// POST /_check — form submission with Turnstile verification
// This redirects to the result page after verifying the human
ui.post('/_check', verifyTurnstile, async (c) => {
  // Body already parsed by turnstile middleware — use the stored copy
  const body = (c as any).get('parsedBody') ?? await c.req.parseBody()
  const input = (body['repo'] as string || '').trim()

  if (!input) {
    return c.redirect('/')
  }

  // Parse input: "owner/repo", "github.com/owner/repo", or full URL
  let path = input
    .replace(/^https?:\/\//, '')
    .replace(/^(www\.)?github\.com\//, '')
    .replace(/\.git$/, '')
    .replace(/\/+$/, '')

  const parts = path.split('/')
  if (parts.length >= 2) {
    return c.redirect(`/github/${parts[0]}/${parts[1]}`)
  }

  return c.redirect('/')
})

// Shared handler for fetching + rendering a result page
async function handleCheck(c: any, provider: string, owner: string, repo: string) {
  const startTime = Date.now()

  // ─── 1. EDGE CACHE (L1) ──────────────────────────────────────────────────
  const cache = caches.default
  // Use a pristine request object to avoid poisoning cache with auth headers
  const cacheKey = new Request(c.req.url)

  const cachedResponse = await cache.match(cacheKey)
  if (cachedResponse) {
    console.log(`⚡ Cache HIT for: ${c.req.url}`)
    // Page views are tracked client-side via sendBeacon → /_view
    return cachedResponse
  }

  console.log(`🐌 Cache MISS. Fetching fresh data for: ${c.req.url}`)

  if (!Object.hasOwn(providers, provider)) {
    return c.html(errorPage(`Unsupported provider: ${provider}`), 400)
  }

  const buildUsageCtx = (cacheStatus: string): UsageContext => ({
    source: 'browser',
    apiKey: 'anon',
    cacheStatus,
    responseTimeMs: Date.now() - startTime,
    cf: (c.req.raw as any).cf,
    userAgent: c.req.header('User-Agent') ?? null,
    ip: null,
  })

  try {
    const { result: cached, status } = await getCached(c.env, provider, owner, repo)

    if (cached && (status === 'l1-hit' || status === 'hit' || status === 'stale')) {
      if (status === 'stale') {
        c.executionCtx.waitUntil(revalidateInBackground(c.env, provider, owner, repo))
      }
      const usageCtx = buildUsageCtx(status)
      c.executionCtx.waitUntil(Promise.all([
        // Direct KV write for recent queries (landing page)
        trackRecentQuery(c.env.CACHE_KV, {
          owner, repo, score: cached.score, verdict: cached.verdict, checkedAt: cached.checkedAt,
        }),
        // Pipeline events
        buildUsageEvent(`${owner}/${repo}`, provider, cached.score, cached.verdict, usageCtx)
          .then(ue => emitAll(c.env, { usage: [ue], result: [buildResultEvent(cached, 'browser')] })),
      ]))
      const firstIndexed = await getFirstSeen(c.env.CACHE_KV, provider, owner, repo)
      const history = await getScoreHistory(c.env.CACHE_KV, owner, repo)
      const trend = computeTrend(history)
      const response = c.html(resultPage(cached, owner, repo, c.env.CF_ANALYTICS_TOKEN, firstIndexed, trend))
      c.executionCtx.waitUntil(cache.put(cacheKey, response.clone()))
      return response
    }

    const prov = providers[provider as keyof typeof providers]
    const rawData = await prov.fetchProject(owner, repo, c.env.GITHUB_TOKEN)
    const result = scoreProject(rawData, prov.name)

    const usageCtx = buildUsageCtx('miss')
    c.executionCtx.waitUntil(Promise.all([
      putCache(c.env, provider, owner, repo, result),
      // Direct KV write for recent queries (landing page)
      trackRecentQuery(c.env.CACHE_KV, {
        owner, repo, score: result.score, verdict: result.verdict, checkedAt: result.checkedAt,
      }),
      // Pipeline events
      buildUsageEvent(`${owner}/${repo}`, provider, result.score, result.verdict, usageCtx)
        .then(ue => emitAll(c.env, {
          usage: [ue],
          result: [buildResultEvent(result, 'browser')],
          provider: [buildProviderEvent('github', owner, repo, rawData._rawResponse)],
        })),
    ]))

    const firstIndexed = await getFirstSeen(c.env.CACHE_KV, provider, owner, repo)
    const history = await getScoreHistory(c.env.CACHE_KV, owner, repo)
    const trend = computeTrend(history)
    
    c.header('Cache-Control', 'public, max-age=3600, s-maxage=3600')
    const response = c.html(resultPage(result, owner, repo, c.env.CF_ANALYTICS_TOKEN, firstIndexed, trend))
    c.executionCtx.waitUntil(cache.put(cacheKey, response.clone()))

    return response
  } catch (err: any) {
    c.header('Cache-Control', 'public, max-age=300')
    const isNotFound = err.message?.includes('not found')
    const status = isNotFound ? 404 : 502
    const message = isNotFound ? 'Project not found' : 'Failed to fetch project data. Please try again later.'
    return c.html(errorPage(message), status)
  }
}

// Shortcut: /owner/repo → redirect to canonical /github/owner/repo
ui.get('/:owner/:repo', async (c) => {
  const { owner, repo } = c.req.param()
  if (!isValidParam(owner) || !isValidParam(repo)) {
    return c.html(errorPage('Invalid repository path.'), 400)
  }
  return c.redirect(`/github/${owner}/${repo}`, 301)
})

// Canonical: /github/owner/repo → renders result page
ui.get('/:provider/:owner/:repo', async (c) => {
  const { provider, owner, repo } = c.req.param()
  if (!isValidParam(owner) || !isValidParam(repo)) {
    return c.html(errorPage('Invalid repository path.'), 400)
  }
  return handleCheck(c, provider, owner, repo)
})

/**
 * Validate URL path params — only allow valid GitHub-style identifiers.
 * Blocks XSS / path-traversal payloads in owner/repo params.
 */
function isValidParam(value: string): boolean {
  return /^[a-zA-Z0-9._-]+$/.test(value) && value.length <= 100
}

export { ui }
