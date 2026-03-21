// ---------------------------------------------------------------------------
// KV Key Constants — single source of truth for all KV key patterns
//
// Convention: ita:{domain}:{key}
//   namespace = ita (isitalive)
//   domain    = cache | state | keys
//   key       = hierarchical path
// ---------------------------------------------------------------------------

/** Score cache (L2 — KV) */
export function scoreKey(provider: string, owner: string, repo: string): string {
  return `ita:cache:score:${provider}/${owner.toLowerCase()}/${repo.toLowerCase()}`
}

/** Audit result cache */
export function auditResultKey(hash: string): string {
  return `ita:cache:audit:${hash}`
}

/** Score history per repo */
export function historyKey(owner: string, repo: string): string {
  return `ita:cache:history:${owner.toLowerCase()}/${repo.toLowerCase()}`
}

/** Recent queries list (landing page) */
export const RECENT_QUERIES_KEY = 'ita:state:recent-queries'

/** Trending repos list (computed from Iceberg, cached by cron) */
export const TRENDING_KEY = 'ita:state:trending'

/** Tracked repos index (computed from Iceberg, cached by cron) */
export const TRACKED_KEY = 'ita:state:tracked'

/** Sitemap repos list (computed from Iceberg, cached by cron) */
export const SITEMAP_KEY = 'ita:state:sitemap'

/** First-seen timestamp per repo */
export function firstSeenKey(provider: string, owner: string, repo: string): string {
  return `ita:state:first-seen:${provider}/${owner.toLowerCase()}/${repo.toLowerCase()}`
}

// ---------------------------------------------------------------------------
// Legacy key mapping — for dual-read during migration
// ---------------------------------------------------------------------------

/** Legacy score cache key (v2 format) */
export function legacyScoreKey(provider: string, owner: string, repo: string): string {
  return `isitalive:v2:${provider}/${owner.toLowerCase()}/${repo.toLowerCase()}`
}

/** Legacy audit result key */
export function legacyAuditResultKey(hash: string): string {
  return `audit:result:${hash}`
}

export const LEGACY_RECENT_KEY = 'isitalive:recent'
export const LEGACY_TRENDING_KEY = 'isitalive:trending'
export const LEGACY_TRENDING_COUNTERS_KEY = 'isitalive:trending:counters'
export const LEGACY_TRACKED_KEY = 'isitalive:tracked'
export const LEGACY_SITEMAP_KEY = 'isitalive:sitemap_repos'

export function legacyFirstSeenKey(provider: string, owner: string, repo: string): string {
  return `isitalive:first-seen:${provider}/${owner.toLowerCase()}/${repo.toLowerCase()}`
}

export function legacyHistoryKey(owner: string, repo: string): string {
  return `isitalive:history:${owner.toLowerCase()}/${repo.toLowerCase()}`
}
