// ---------------------------------------------------------------------------
// Terms of Service page — renders TERMS.md into styled HTML at build time
// ---------------------------------------------------------------------------

import { navbarHtml, footerHtml, componentCss } from './components'
import { escapeHtml } from './error'
import termsMd from '../../TERMS.md'

/**
 * Minimal markdown→HTML for the subset used in TERMS.md:
 *   # h1, ## h2, **bold**, [text](url), > blockquotes, - list items, paragraphs
 */
function renderMarkdown(md: string): string {
  const lines = md.split('\n')
  const out: string[] = []
  let inList = false
  let inBlockquote = false

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // Close list if we've left it
    if (inList && !line.startsWith('- ')) {
      out.push('</ul></div>')
      inList = false
    }

    // Close blockquote if we've left it
    if (inBlockquote && !line.startsWith('>')) {
      out.push('</div>')
      inBlockquote = false
    }

    // Skip the title (# Terms of Service) — we render it separately
    if (line.startsWith('# ') && !line.startsWith('## ')) continue

    // Italic line (*Last updated...*)
    const italicMatch = line.match(/^\*(.+)\*$/)
    if (italicMatch) {
      out.push(`<p class="last-updated">${inline(italicMatch[1])}</p>`)
      continue
    }

    // ## Heading
    if (line.startsWith('## ')) {
      out.push(`<h2>${inline(line.slice(3))}</h2>`)
      continue
    }

    // > Blockquote
    if (line.startsWith('> ')) {
      if (!inBlockquote) {
        out.push('<div class="note-box">')
        inBlockquote = true
      }
      out.push(`<p>${inline(line.slice(2))}</p>`)
      continue
    }

    // - List item
    if (line.startsWith('- ')) {
      if (!inList) {
        out.push('<div class="section-card"><ul>')
        inList = true
      }
      out.push(`<li>${inline(line.slice(2))}</li>`)
      continue
    }

    // Empty line
    if (line.trim() === '') continue

    // Paragraph
    out.push(`<p>${inline(line)}</p>`)
  }

  if (inList) out.push('</ul></div>')
  if (inBlockquote) out.push('</div>')

  return out.join('\n')
}

/** Inline markdown: **bold**, [text](url), backslash escapes, with HTML safety */
function inline(text: string): string {
  return escapeHtml(text)
    .replace(/\\(.)/g, '$1')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, label, href) => {
      if (/^https?:\/\/|^mailto:/i.test(href)) {
        return `<a href="${href}" class="contact-link">${label}</a>`
      }
      return label
    })
}

// Pre-render once at module init — TERMS.md is static per deploy
const renderedTerms = renderMarkdown(termsMd)

export function termsPage(analyticsToken?: string): string {
  const rendered = renderedTerms

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
  <meta name="theme-color" content="#0a0a0f">
  <meta name="color-scheme" content="dark">
  <title>Terms of Service — Is It Alive?</title>
  <meta name="description" content="Terms of Service for isitalive.dev — open-source project health checker.">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="preload" as="style" href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap">
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" media="print" onload="this.media='all'">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    ${componentCss}

    :root {
      --bg-primary: #0a0a0f;
      --surface: rgba(255,255,255,0.04);
      --border: rgba(255,255,255,0.08);
      --text-primary: #e8e8ed;
      --text-secondary: #8b8b9e;
      --text-muted: #55556a;
      --accent: #6366f1;
    }

    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      background: var(--bg-primary);
      color: var(--text-primary);
      min-height: 100dvh;
      line-height: 1.6;
    }

    .bg-orb {
      position: fixed;
      border-radius: 50%;
      pointer-events: none;
      z-index: 0;
    }
    .bg-orb-1 { width: 500px; height: 500px; background: radial-gradient(circle, rgba(99,102,241,0.08) 0%, transparent 70%); top: -150px; right: -100px; }
    .bg-orb-2 { width: 400px; height: 400px; background: radial-gradient(circle, rgba(34,197,94,0.08) 0%, transparent 70%); bottom: -150px; left: -100px; }

    .container {
      position: relative;
      z-index: 1;
      max-width: 800px;
      margin: 0 auto;
      padding: 0 24px;
    }

    .last-updated {
      color: var(--text-muted);
      font-size: 0.78rem;
      margin-top: 32px;
      letter-spacing: 0.5px;
    }

    h1 {
      font-size: 2rem;
      font-weight: 800;
      margin: 12px 0 12px;
      letter-spacing: -0.02em;
    }

    h2 {
      font-size: 1.1rem;
      font-weight: 700;
      margin: 40px 0 16px;
      color: var(--text-primary);
    }

    p {
      color: var(--text-secondary);
      font-size: 0.85rem;
      margin-bottom: 12px;
      line-height: 1.7;
    }

    .section-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 24px 28px;
      margin-bottom: 16px;
      transition: border-color 0.3s;
    }
    .section-card:hover { border-color: rgba(255,255,255,0.15); }

    .section-card ul {
      padding-left: 20px;
      margin: 0;
    }

    .section-card li {
      color: var(--text-secondary);
      font-size: 0.85rem;
      margin-bottom: 6px;
      line-height: 1.7;
    }

    .note-box {
      background: rgba(99,102,241,0.08);
      border: 1px solid rgba(99,102,241,0.2);
      border-radius: 12px;
      padding: 16px 20px;
      margin: 24px 0;
      font-size: 0.85rem;
      color: var(--text-secondary);
    }
    .note-box strong { color: var(--text-primary); }

    .contact-link {
      color: var(--accent);
      text-decoration: none;
      transition: opacity 0.2s;
    }
    .contact-link:hover { opacity: 0.8; }

    @media (max-width: 640px) {
      h1 { font-size: 1.5rem; }
      .section-card { padding: 18px; }
    }
  </style>
</head>
<body>
  <div class="bg-orb bg-orb-1"></div>
  <div class="bg-orb bg-orb-2"></div>

  ${navbarHtml}

  <div class="container">
    <h1>Terms of Service</h1>
    ${rendered}
  </div>

  ${footerHtml}
  ${analyticsToken ? '<script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon=\'{"token":"' + analyticsToken + '"}\'></script>' : ''}
</body>
</html>`
}
