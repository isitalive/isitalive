// ---------------------------------------------------------------------------
// Cloudflare Web Analytics — proxied through our own domain to bypass ad
// blockers. Paths are deliberately generic (/t/a.js, /t/d) to avoid matching
// filter-list patterns like "beacon", "analytics", "tracking", "rum", etc.
// ---------------------------------------------------------------------------

/**
 * Returns the analytics `<script>` tag for CF Web Analytics, or empty string
 * if no token is configured. Uses proxied paths to avoid ad-blocker blocks.
 */
export function analyticsScript(token?: string): string {
  if (!token) return ''
  return `<script defer src="/t/a.js" data-cf-beacon='{"send":{"to":"/t/d"},"token":"${token}"}'></script>`
}
