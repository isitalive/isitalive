// ---------------------------------------------------------------------------
// /og/:provider/:owner/:repo.png — dynamic Open Graph share card
//
// Renders a 1200×630 PNG with the live maintenance-health score so shared
// result links show the score on the card itself. Same cache pipeline as
// the badge: L1 response cache → L2 score cache → provider fetch.
//
// workers-og (satori + resvg wasm) is imported dynamically so the module
// never loads outside the Workers runtime (tests, static build).
// ---------------------------------------------------------------------------

import { Hono } from 'hono'
import type { Env } from '../types/env'
import { providers, fetchAndScoreProject, scheduleRevalidation } from '../providers/index'
import { CacheManager } from '../cache/index'
import { isValidParam } from '../utils/validate'
import { ogImageHtml, OG_IMAGE_WIDTH, OG_IMAGE_HEIGHT } from '../ui/og-image'

const og = new Hono<{ Bindings: Env }>()

type OgFont = { name: string; data: ArrayBuffer; weight: number; style: 'normal' }

// Fonts are fetched from Google Fonts once per isolate and reused across
// renders. On failure the promise resets so the next request retries.
let fontsPromise: Promise<OgFont[]> | null = null

function loadFonts(): Promise<OgFont[]> {
  if (!fontsPromise) {
    fontsPromise = (async () => {
      const { loadGoogleFont } = await import('workers-og')
      const [regular, bold, extrabold] = await Promise.all([
        loadGoogleFont({ family: 'Inter', weight: 400 }),
        loadGoogleFont({ family: 'Inter', weight: 700 }),
        loadGoogleFont({ family: 'Inter', weight: 800 }),
      ])
      return [
        { name: 'Inter', data: regular, weight: 400, style: 'normal' as const },
        { name: 'Inter', data: bold, weight: 700, style: 'normal' as const },
        { name: 'Inter', data: extrabold, weight: 800, style: 'normal' as const },
      ]
    })().catch((err) => {
      fontsPromise = null
      throw err
    })
  }
  return fontsPromise
}

og.get('/:provider/:owner/:repoPng{.+\\.png}', async (c) => {
  const { provider, owner: rawOwner, repoPng } = c.req.param()

  const owner = rawOwner.toLowerCase()
  const repo = repoPng.replace(/\.png$/, '').toLowerCase()

  if (!isValidParam(owner) || !isValidParam(repo)) {
    return c.text('Invalid repository path', 400)
  }

  if (!Object.hasOwn(providers, provider)) {
    return c.text('Unsupported provider', 400)
  }

  const cacheManager = new CacheManager(c.env, c.executionCtx)
  const cacheKey = new Request(c.req.url)

  // L1 response cache fast-path — serve the rendered PNG directly.
  const cachedResponse = await cacheManager.getResponse(cacheKey, false)
  if (cachedResponse) {
    return cachedResponse
  }

  try {
    const { result: cached, status } = await cacheManager.get(provider, owner, repo)

    let result = cached

    if (status === 'l2-stale' && cached) {
      // Serve stale, revalidate in background
      c.executionCtx.waitUntil(scheduleRevalidation(c.env, c.executionCtx, provider, owner, repo))
    }

    if (!result) {
      ({ result } = await fetchAndScoreProject(c.env, provider, owner, repo))
      c.executionCtx.waitUntil(cacheManager.put(provider, owner, repo, result))
    }

    const [{ ImageResponse }, fonts] = await Promise.all([import('workers-og'), loadFonts()])
    const html = ogImageHtml(owner, repo, result.score, result.verdict)
    const image = new ImageResponse(html, {
      width: OG_IMAGE_WIDTH,
      height: OG_IMAGE_HEIGHT,
      format: 'png',
      fonts,
    })
    const png = await image.arrayBuffer()

    const response = c.body(png, 200, {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
      'CDN-Cache-Control': 'public, s-maxage=86400',
    })

    // Prime the L1 response cache — rendering costs real CPU, so repeated
    // crawler hits (Twitter, Slack, Discord all fetch separately) skip it.
    c.executionCtx.waitUntil(cacheManager.putResponse(cacheKey, response))

    return response
  } catch (err) {
    // No fallback image — a wrong score on a share card is worse than none.
    console.error(`OG image render failed for ${provider}/${owner}/${repo}:`, err)
    return c.text('OG image unavailable', 503, {
      'Cache-Control': 'public, max-age=300',
    })
  }
})

export { og }
