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
import { auditResultPage } from '../ui/audit-result'
import { buildPageViewUsageEvent } from '../events/usage'
import { buildResultEvent } from '../events/result'
import { buildProviderEvent } from '../events/provider'
import { emitAll } from '../pipeline/emit'
import { parseManifest, type ManifestFormat } from '../audit/parsers'
import { resolveAll } from '../audit/resolver'
import { scoreAudit, hashManifest, type AuditResult } from '../audit/scorer'
import { discoverManifests } from '../audit/discovery'
import type { ParsedDep } from '../audit/parsers'

const ui = new Hono<{ Bindings: Env }>()



const allowedViewHosts = new Set(['isitalive.dev', 'www.isitalive.dev', 'localhost', '127.0.0.1', '[::1]'])

function hasAllowedViewOrigin(originHeader: string): boolean {
  if (!originHeader) {
    return false
  }

  try {
    const { hostname } = new URL(originHeader)
    return allowedViewHosts.has(hostname) || hostname.endsWith('.rootd.workers.dev')
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
  c.header('CDN-Cache-Control', 'public, s-maxage=3600')
  return c.text(xml)
})

// Landing page — static shell, chips hydrated client-side
ui.get('/', (c) => {
  c.header('Cache-Control', 'public, max-age=3600, s-maxage=3600')
  c.header('CDN-Cache-Control', 'public, s-maxage=3600')
  return c.html(landingPage(c.env.TURNSTILE_SITE_KEY, c.env.CF_ANALYTICS_TOKEN))
})

// Recent queries API — lightweight JSON for client-side hydration
// Mounted under /_data/ to avoid /api/* rate-limit + auth middleware
ui.get('/_data/recent', async (c) => {
  const recent = await getRecentQueries(c.env.CACHE_KV)
  c.header('Cache-Control', 'public, max-age=60, s-maxage=60')
  c.header('CDN-Cache-Control', 'public, s-maxage=60')
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
  c.header('CDN-Cache-Control', 'public, s-maxage=86400')
  return c.html(methodologyPage(c.env.CF_ANALYTICS_TOKEN))
})

// API docs page
ui.get('/api', (c) => {
  c.header('Cache-Control', 'public, max-age=86400, s-maxage=86400')
  c.header('CDN-Cache-Control', 'public, s-maxage=86400')
  return c.html(apiDocsPage(c.env.CF_ANALYTICS_TOKEN))
})

// Terms of Service page — static per deploy
ui.get('/terms', (c) => {
  c.header('Cache-Control', 'public, max-age=86400, s-maxage=86400')
  c.header('CDN-Cache-Control', 'public, s-maxage=86400')
  return c.html(termsPage(c.env.CF_ANALYTICS_TOKEN))
})

// Trending page — static HTML shell (data hydrated client-side)
ui.get('/trending', (c) => {
  c.header('Cache-Control', 'public, max-age=3600, s-maxage=3600')
  c.header('CDN-Cache-Control', 'public, s-maxage=3600')
  return c.html(trendingPage(c.env.CF_ANALYTICS_TOKEN))
})

// Trending data — paginated JSON for client-side hydration
// Mounted under /_data/ to avoid /api/* rate-limit + auth middleware
ui.get('/_data/trending', async (c) => {
  const allRepos = await getTrending(c.env.CACHE_KV)
  const limit = Math.max(1, parseInt(c.req.query('limit') || '20', 10))
  const offset = Math.max(0, parseInt(c.req.query('offset') || '0', 10))
  const page = allRepos.slice(offset, offset + limit)
  c.header('Cache-Control', 'public, max-age=60, s-maxage=60')
  c.header('CDN-Cache-Control', 'public, s-maxage=60')
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
  c.header('CDN-Cache-Control', 'public, s-maxage=3600')
  return c.html(changelogPage(c.env.CF_ANALYTICS_TOKEN))
})

// Changelog data — paginated JSON for client-side hydration
ui.get('/_data/changelog', (c) => {
  const page = Math.max(1, parseInt(c.req.query('page') || '1', 10))
  const limit = Math.min(20, Math.max(1, parseInt(c.req.query('limit') || '5', 10)))

  const all = parseChangelogMd(changelogMd)
  const start = (page - 1) * limit
  const versions = all.slice(start, start + limit)
  const hasMore = start + limit < all.length

  c.header('Cache-Control', 'public, max-age=3600, s-maxage=3600')
  c.header('CDN-Cache-Control', 'public, s-maxage=3600')
  return c.json({ versions, page, hasMore, total: all.length })
})

// Dependency health data — JSON for client-side hydration on result pages
// Discovers manifests at repo root, parses + deduplicates deps, scores them.
ui.get('/_data/deps/:provider/:owner/:repo', async (c) => {
  const { provider, owner, repo } = c.req.param()

  if (provider !== 'github' || !isValidParam(owner) || !isValidParam(repo)) {
    return c.json({ manifests: [], error: 'Invalid parameters' }, 400)
  }

  // Check for cached deps result first
  const depsCacheKey = `deps:github:${owner}/${repo}`
  const cachedDeps = await c.env.CACHE_KV.get(depsCacheKey)
  if (cachedDeps) {
    c.header('Cache-Control', 'public, max-age=3600, s-maxage=3600')
    c.header('CDN-Cache-Control', 'public, s-maxage=3600')
    return c.json(JSON.parse(cachedDeps))
  }

  // Discover manifests at repo root
  if (!c.env.GITHUB_TOKEN) {
    return c.json({ manifests: [] }, 500)
  }
  const manifests = await discoverManifests(owner, repo, c.env.GITHUB_TOKEN, c.env.CACHE_KV)

  if (manifests.length === 0) {
    const empty = { manifests: [] as string[] }
    // Cache the "no manifests" result briefly (1 hour)
    await c.env.CACHE_KV.put(depsCacheKey, JSON.stringify(empty), { expirationTtl: 3600 })
    c.header('Cache-Control', 'public, max-age=3600, s-maxage=3600')
    c.header('CDN-Cache-Control', 'public, s-maxage=3600')
    return c.json(empty)
  }

  // Fetch and parse all discovered manifests
  let allDeps: ParsedDep[] = []
  const manifestNames: string[] = []

  for (const manifest of manifests) {
    try {
      const res = await fetch(manifest.downloadUrl, {
        headers: { 'User-Agent': 'isitalive/1.0' },
        signal: AbortSignal.timeout(5000),
      })
      if (!res.ok) continue

      const content = await res.text()
      if (content.length > 512 * 1024) continue // Skip oversized manifests

      const deps = parseManifest(manifest.format, content)
      allDeps.push(...deps)
      manifestNames.push(manifest.filename)
    } catch {
      // Non-critical — skip this manifest
    }
  }

  if (allDeps.length === 0) {
    const empty = { manifests: manifestNames, dependencies: [], summary: { healthy: 0, stable: 0, degraded: 0, critical: 0, unmaintained: 0, avgScore: 0 }, total: 0, scored: 0, pending: 0, complete: true }
    await c.env.CACHE_KV.put(depsCacheKey, JSON.stringify(empty), { expirationTtl: 3600 })
    c.header('Cache-Control', 'public, max-age=3600, s-maxage=3600')
    c.header('CDN-Cache-Control', 'public, s-maxage=3600')
    return c.json(empty)
  }

  // Deduplicate deps by name (keep first occurrence)
  const seen = new Set<string>()
  allDeps = allDeps.filter((d) => {
    if (seen.has(d.name)) return false
    seen.add(d.name)
    return true
  })

  // Resolve to GitHub repos + score
  const resolved = await resolveAll(allDeps, c.env)

  // Hash the combined content for scoreAudit's cache key
  const combinedContent = allDeps.map(d => `${d.name}@${d.version}`).join('\n')
  const contentHash = await hashManifest(combinedContent)

  const auditResult = await scoreAudit(resolved, manifestNames.join('+'), contentHash, c.env, c.executionCtx)

  const result = {
    manifests: manifestNames,
    dependencies: auditResult.dependencies,
    summary: auditResult.summary,
    total: auditResult.total,
    scored: auditResult.scored,
    pending: auditResult.pending,
    complete: auditResult.complete,
  }

  // Cache complete results for 6 hours, partial for 5 min
  const ttl = auditResult.complete ? 6 * 60 * 60 : 5 * 60
  c.executionCtx.waitUntil(
    c.env.CACHE_KV.put(depsCacheKey, JSON.stringify(result), { expirationTtl: ttl }),
  )

  c.header('Cache-Control', 'public, max-age=3600, s-maxage=3600')
  c.header('CDN-Cache-Control', 'public, s-maxage=3600')
  return c.json(result)
})
// This redirects to the result page after verifying the human.
// Smart detection: if the input is a manifest URL, redirect to the audit flow.
ui.post('/_check', verifyTurnstile, async (c) => {
  // Body already parsed by turnstile middleware — use the stored copy
  const body = (c as any).get('parsedBody') ?? await c.req.parseBody()
  const input = (body['repo'] as string || '').trim()

  if (!input) {
    return c.redirect('/')
  }

  // Detect manifest URL: github.com/owner/repo/blob/.../package.json or go.mod
  // Uses a permissive path match (.+/) to support slashed branch names (e.g. feature/foo).
  const manifestMatch = input.match(MANIFEST_URL_RE)
  if (manifestMatch) {
    const filename = manifestMatch[1]
    // Append ?raw=1 to the GitHub blob URL — GitHub resolves branch vs path
    // correctly regardless of slashes in the ref.
    const blobUrl = input.replace(/^(?!https?:\/\/)/, 'https://')
    const rawUrl = blobUrl + (blobUrl.includes('?') ? '&' : '?') + 'raw=1'
    return handleAuditFromUrl(c, rawUrl, filename)
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

// POST /_audit — Turnstile-gated manifest audit from URL
// Accepts a GitHub manifest URL, fetches the raw content, scores, redirects
ui.post('/_audit', verifyTurnstile, async (c) => {
  const body = (c as any).get('parsedBody') ?? await c.req.parseBody()
  const url = (body['url'] as string || '').trim()

  if (!url) {
    return c.html(errorPage('Please provide a manifest URL.'), 400)
  }

  const manifestMatch = url.match(MANIFEST_URL_RE)
  if (!manifestMatch) {
    return c.html(errorPage('Invalid manifest URL. Paste a GitHub link to a package.json or go.mod file.'), 400)
  }

  const filename = manifestMatch[1]
  const blobUrl = url.replace(/^(?!https?:\/\/)/, 'https://')
  const rawUrl = blobUrl + (blobUrl.includes('?') ? '&' : '?') + 'raw=1'
  return handleAuditFromUrl(c, rawUrl, filename)
})

// GET /audit/:hash — audit result page (SSR from KV cache)
ui.get('/audit/:hash', async (c) => {
  const hash = c.req.param('hash')

  if (!/^[a-f0-9]{64}$/.test(hash)) {
    return c.html(errorPage('Invalid audit hash.'), 400)
  }

  const cached = await c.env.CACHE_KV.get(`audit:result:${hash}`)
  if (!cached) {
    return c.html(errorPage('Audit not found. This result may have expired or the manifest has not been audited yet.'), 404)
  }

  let result: AuditResult
  try {
    result = JSON.parse(cached)
  } catch {
    return c.html(errorPage('Cached audit data is corrupted.'), 500)
  }

  c.header('Cache-Control', 'public, max-age=3600, s-maxage=3600')
  c.header('CDN-Cache-Control', 'public, s-maxage=3600')
  return c.html(auditResultPage(result, c.env.CF_ANALYTICS_TOKEN))
})

// GET /_data/audit/:hash — JSON data endpoint for client-side use
ui.get('/_data/audit/:hash', async (c) => {
  const hash = c.req.param('hash')

  if (!/^[a-f0-9]{64}$/.test(hash)) {
    return c.json({ error: 'Invalid hash' }, 400)
  }

  const cached = await c.env.CACHE_KV.get(`audit:result:${hash}`)
  if (!cached) {
    return c.json({ error: 'Not found' }, 404)
  }

  c.header('Cache-Control', 'public, max-age=3600')
  c.header('CDN-Cache-Control', 'public, s-maxage=3600')
  try {
    return c.json(JSON.parse(cached))
  } catch {
    return c.json({ error: 'Corrupted data' }, 500)
  }
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



  try {
    const { result: cached, status } = await getCached(c.env, provider, owner, repo)

    if (cached && (status === 'l1-hit' || status === 'hit' || status === 'stale')) {
      if (status === 'stale') {
        c.executionCtx.waitUntil(revalidateInBackground(c.env, provider, owner, repo))
      }
      // Browser checks are anonymous — no usage events (tracked via Web Analytics).
      // Track recent queries for landing page (trending/emissions are handled elsewhere).
      c.executionCtx.waitUntil(Promise.all([
        trackRecentQuery(c.env.CACHE_KV, {
          owner, repo, score: cached.score, verdict: cached.verdict, checkedAt: cached.checkedAt,
        }),
      ]))
      const firstIndexed = await getFirstSeen(c.env.CACHE_KV, provider, owner, repo)
      const history = await getScoreHistory(c.env.CACHE_KV, owner, repo)
      const trend = computeTrend(history)
      c.header('Cache-Control', 'public, max-age=3600, s-maxage=3600')
      c.header('CDN-Cache-Control', 'public, s-maxage=3600')
      const response = c.html(resultPage(cached, owner, repo, c.env.CF_ANALYTICS_TOKEN, firstIndexed, trend))
      c.executionCtx.waitUntil(cache.put(cacheKey, response.clone()))
      return response
    }

    const prov = providers[provider as keyof typeof providers]
    const rawData = await prov.fetchProject(owner, repo, c.env.GITHUB_TOKEN)
    const result = scoreProject(rawData, prov.name)

    // Browser checks are anonymous — skip usage events.
    // Emit result/provider events on miss (powers trending) and track for landing page.
    c.executionCtx.waitUntil(Promise.all([
      putCache(c.env, provider, owner, repo, result),
      trackRecentQuery(c.env.CACHE_KV, {
        owner, repo, score: result.score, verdict: result.verdict, checkedAt: result.checkedAt,
      }),
      emitAll(c.env, {
        result: [buildResultEvent(result, 'browser')],
        provider: [buildProviderEvent('github', owner, repo, rawData._rawResponse)],
      }),
    ]))

    const firstIndexed = await getFirstSeen(c.env.CACHE_KV, provider, owner, repo)
    const history = await getScoreHistory(c.env.CACHE_KV, owner, repo)
    const trend = computeTrend(history)
    
    c.header('Cache-Control', 'public, max-age=3600, s-maxage=3600')
    c.header('CDN-Cache-Control', 'public, s-maxage=3600')
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

// ---------------------------------------------------------------------------
// Handle audit from a raw GitHub URL — shared by /_check and /_audit
// ---------------------------------------------------------------------------

const MANIFEST_FORMATS: Record<string, ManifestFormat> = {
  'package.json': 'package.json',
  'go.mod': 'go.mod',
}

/** Matches GitHub blob URLs ending in package.json or go.mod (supports slashed branch names) */
const MANIFEST_URL_RE = /(?:https?:\/\/)?(?:www\.)?github\.com\/.+\/blob\/.+\/(package\.json|go\.mod)$/i

async function handleAuditFromUrl(c: any, rawUrl: string, filePath: string): Promise<Response> {
  // Determine format from filename
  const filename = filePath.split('/').pop() || ''
  const format = MANIFEST_FORMATS[filename]
  if (!format) {
    return c.html(errorPage(`Unsupported file: ${filename}. We support package.json and go.mod.`), 400)
  }

  // Fetch raw content from GitHub
  let content: string
  try {
    const res = await fetch(rawUrl, {
      headers: { 'User-Agent': 'isitalive/1.0' },
    })
    if (!res.ok) {
      const status = res.status === 404 ? 'File not found' : `GitHub returned ${res.status}`
      return c.html(errorPage(`Could not fetch manifest: ${status}. Check the URL and try again.`), 400)
    }
    content = await res.text()
  } catch {
    return c.html(errorPage('Failed to fetch the manifest from GitHub. Please try again.'), 502)
  }

  if (content.length > 512 * 1024) {
    return c.html(errorPage('Manifest file is too large (max 512KB).'), 400)
  }

  // Hash + check cache first
  const contentHash = await hashManifest(content)
  const auditCacheKey = `audit:result:${contentHash}`
  const cached = await c.env.CACHE_KV.get(auditCacheKey)

  if (cached) {
    // Already scored — redirect straight to result page
    return c.redirect(`/audit/${contentHash}`)
  }

  // Parse + resolve + score
  let deps
  try {
    deps = parseManifest(format, content)
  } catch (err: any) {
    return c.html(errorPage(`Could not parse ${filename}: ${err.message}`), 400)
  }

  if (deps.length === 0) {
    return c.html(errorPage(`No dependencies found in ${filename}.`), 400)
  }

  const resolved = await resolveAll(deps, c.env)
  const auditResult = await scoreAudit(resolved, format, contentHash, c.env, c.executionCtx)

  // Write KV synchronously before redirect — scoreAudit only writes via
  // waitUntil for complete results, so the redirect could race.
  // Always persist (even partial results) so /audit/:hash can render.
  const auditCacheKey2 = `audit:result:${contentHash}`
  await c.env.CACHE_KV.put(auditCacheKey2, JSON.stringify(auditResult), {
    expirationTtl: 6 * 60 * 60, // 6 hours
  })

  return c.redirect(`/audit/${contentHash}`)
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
