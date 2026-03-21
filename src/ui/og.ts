// ---------------------------------------------------------------------------
// Open Graph + Twitter Card meta tag helper
//
// Usage: include ${ogTags({ title, description, url })} in each page's <head>
// ---------------------------------------------------------------------------

import { escapeHtml } from './error'

export interface OgMeta {
  title: string
  description: string
  url: string
  image?: string
  type?: 'website' | 'article'
  twitterCard?: 'summary' | 'summary_large_image'
}

/**
 * Build OG, Twitter Card, and canonical meta tags as a raw HTML string.
 * All values are HTML-escaped to prevent XSS via dynamic repo names.
 */
export function ogTags(meta: OgMeta): string {
  const type = meta.type ?? 'website'
  const card = meta.twitterCard ?? 'summary'

  const t = escapeHtml(meta.title)
  const d = escapeHtml(meta.description)
  const u = escapeHtml(meta.url)

  const lines: string[] = [
    `<meta name="theme-color" content="#0a0a0f">`,
    `<meta name="color-scheme" content="dark">`,
    `<meta property="og:type" content="${type}">`,
    `<meta property="og:title" content="${t}">`,
    `<meta property="og:description" content="${d}">`,
    `<meta property="og:url" content="${u}">`,
    `<meta property="og:site_name" content="Is It Alive?">`,
    `<meta name="twitter:card" content="${card}">`,
    `<meta name="twitter:title" content="${t}">`,
    `<meta name="twitter:description" content="${d}">`,
    `<link rel="canonical" href="${u}">`,
  ]

  if (meta.image) {
    const img = escapeHtml(meta.image)
    lines.splice(6, 0, `<meta property="og:image" content="${img}">`)
    lines.push(`<meta name="twitter:image" content="${img}">`)
  }

  return lines.join('\n  ')
}
