// ---------------------------------------------------------------------------
// Web UI routes — landing page and result pages
//
// Turnstile protects the search form submission (POST /_check).
// Direct URL visits (GET /:owner/:repo) are not gated — they're shareable
// links and always hit cache.
//
// Result pages are thin HTML shells — the client fetches data from the API.
// Analytics are tracked by the API call, not by the UI routes.
// ---------------------------------------------------------------------------

import { Hono } from 'hono'
import type { Env } from '../scoring/types'
import { providers } from '../providers/index'
import { getCached } from '../cache/index'
import { landingPage } from '../ui/landing'
import { resultPage } from '../ui/result'
import { errorPage } from '../ui/error'
import { methodologyPage } from '../ui/methodology'
import { termsPage } from '../ui/terms'
import { changelogPage } from '../ui/changelog'
import { verifyTurnstile } from '../middleware/turnstile'
import { getRecentQueries } from '../cache/recentQueries'
import { getTrending, getSitemapRepos } from '../cron/handler'
import { trendingPage } from '../ui/trending'
import { parseChangelog as parseChangelogMd } from '../changelog/parser'
import changelogMd from '../../CHANGELOG.md'
import { apiDocsPage } from '../ui/api-docs'

const ui = new Hono<{ Bindings: Env }>()

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

// ---------------------------------------------------------------------------
// Result page — thin HTML shell, client-side rendered from API
//
// The shell has correct OG tags for social sharing. If we have cached data
// in KV, we use the score/verdict for OG description. Otherwise, generic.
// The client JS fetches /api/check/github/:owner/:repo for the actual data.
// ---------------------------------------------------------------------------
async function handleCheck(c: any, provider: string, owner: string, repo: string) {
  if (!Object.hasOwn(providers, provider)) {
    return c.html(errorPage(`Unsupported provider: ${provider}`), 400)
  }

  // Quick KV lookup for OG tag data (optional — if miss, we use generic text)
  let ogData: { score: number; verdict: string } | null = null
  try {
    const { result } = await getCached(c.env, provider, owner, repo)
    if (result) {
      ogData = { score: result.score, verdict: result.verdict }
    }
  } catch {
    // KV miss or error — no problem, shell renders with generic OG tags
  }

  c.header('Cache-Control', 'public, max-age=3600, s-maxage=3600')
  return c.html(resultPage(owner, repo, c.env.CF_ANALYTICS_TOKEN, ogData))
}

// Shortcut: /owner/repo → redirect to canonical /github/owner/repo
ui.get('/:owner/:repo', async (c) => {
  const { owner, repo } = c.req.param()
  if (!isValidParam(owner) || !isValidParam(repo)) {
    return c.html(errorPage('Invalid repository path.'), 400)
  }
  return c.redirect(`/github/${owner}/${repo}`, 301)
})

// Canonical: /github/owner/repo → renders result page shell
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
