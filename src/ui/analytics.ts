// ---------------------------------------------------------------------------
// Cloudflare Web Analytics — proxied through our own domain to bypass ad blockers.
//
// The beacon script is served from /_cwa/beacon.js (proxied from
// static.cloudflareinsights.com) and reports to /_cwa/rum (proxied to
// cloudflareinsights.com/cdn-cgi/rum). This avoids ad-blocker domain lists.
// ---------------------------------------------------------------------------

/**
 * Returns the analytics `<script>` tag for CF Web Analytics, or empty string
 * if no token is configured. Uses proxied paths to avoid ad-blocker blocks.
 */
export function analyticsScript(token?: string): string {
  if (!token) return ''
  return `<script defer src="/_cwa/beacon.js" data-cf-beacon='{"send":{"to":"/_cwa/rum"},"token":"${token}"}'></script>`
}
