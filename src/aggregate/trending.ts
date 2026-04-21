// ---------------------------------------------------------------------------
// Aggregate: Trending — derive trending repos from Iceberg, cache in KV
//
// Replaces the queue consumer's real-time trending counter maintenance.
// Cron runs this every 10 min → queries Iceberg → caches in KV.
// ---------------------------------------------------------------------------

import type { Env } from '../types/env'
import { queryR2SQL } from '../admin/r2sql'
import { TRENDING_KEY } from '../state/keys'

/** Trending repo entry (cached in KV, consumed by UI) */
export interface TrendingRepo {
  repo: string
  score: number
  verdict: string
}

/** Cached trending payload. `degraded` is true when we had to widen past 24h. */
export interface TrendingCache {
  repos: TrendingRepo[]
  generatedAt: string
  windowUsed: '24 hours' | '7 days' | '30 days' | '90 days' | 'none'
  degraded: boolean
}

/** Ordered lookback windows — queried in order until one returns rows. */
const WINDOW_TIERS = ['24 hours', '7 days', '30 days', '90 days'] as const
type Window = (typeof WINDOW_TIERS)[number]

// R2 SQL limitations: no JOINs, no subqueries in FROM clause.
// Use flat GROUP BY with MAX() for latest score/verdict approximation.
// This is accurate enough since scores rarely change within the window.
function buildTrendingSQL(window: Window): string {
  return `
SELECT
  repo,
  COUNT(*) as checks,
  MAX(score) as score,
  MAX(verdict) as verdict
FROM usage_events
WHERE timestamp > NOW() - INTERVAL '${window}'
  AND repo != ''
GROUP BY repo
ORDER BY checks DESC
LIMIT 250
`
}

function mapRows(rows: any[][]): TrendingRepo[] {
  return rows.map(row => ({
    repo: String(row[0]),
    // row[1] = checks — used for ORDER BY but not exposed in API
    score: Math.round(Number(row[2])),
    verdict: String(row[3]),
  }))
}

/**
 * Query Iceberg for trending repos and cache the result in KV.
 *
 * Uses a tiered-window fallback: tries 24h first (the primary signal),
 * widening to 7d / 30d / 90d if earlier windows yield zero rows. Any window
 * wider than 24h is flagged `degraded: true` so the UI can surface a banner.
 *
 * If all queries fail or every window is empty, we keep the existing KV
 * value intact — an empty write would poison the public /trending page for
 * the 2h TTL window.
 */
export async function refreshTrending(env: Env): Promise<TrendingRepo[]> {
  let used: Window | null = null
  let repos: TrendingRepo[] = []
  let anyError = false

  for (const window of WINDOW_TIERS) {
    const result = await queryR2SQL(env, buildTrendingSQL(window))

    if (result.error) {
      console.error(`Aggregate: trending ${window} query failed:`, result.error)
      anyError = true
      continue
    }

    if (result.rows.length > 0) {
      repos = mapRows(result.rows)
      used = window
      break
    }
  }

  if (!used) {
    const why = anyError ? 'all queries errored' : 'no rows in any window'
    console.warn(`Aggregate: trending refresh produced no repos (${why}); preserving existing KV value`)
    // Return last-known-good so callers still get useful data.
    return getTrending(env.CACHE_KV)
  }

  const payload: TrendingCache = {
    repos,
    generatedAt: new Date().toISOString(),
    windowUsed: used,
    degraded: used !== '24 hours',
  }

  try {
    await env.CACHE_KV.put(TRENDING_KEY, JSON.stringify(payload), {
      expirationTtl: 7200, // 2h safety net (refreshed every 10 min)
    })
  } catch (err: any) {
    console.error('Aggregate: trending KV write failed:', err?.message || err)
  }

  return repos
}

/**
 * Read cached trending repos. Handles both the new `TrendingCache` wrapper
 * and the legacy `TrendingRepo[]` payload for zero-downtime migration.
 */
export async function getTrending(kv: KVNamespace): Promise<TrendingRepo[]> {
  const cache = await getTrendingCache(kv)
  return cache.repos
}

/**
 * Read the full trending cache including freshness metadata.
 * Used by the /_data/trending route to surface the `degraded` flag.
 */
export async function getTrendingCache(kv: KVNamespace): Promise<TrendingCache> {
  try {
    const raw = await kv.get(TRENDING_KEY, 'json') as TrendingCache | TrendingRepo[] | null
    if (!raw) return emptyCache()
    // Legacy format: bare array
    if (Array.isArray(raw)) {
      return {
        repos: raw,
        generatedAt: new Date(0).toISOString(),
        windowUsed: '24 hours',
        degraded: false,
      }
    }
    return raw
  } catch {
    return emptyCache()
  }
}

function emptyCache(): TrendingCache {
  return {
    repos: [],
    generatedAt: new Date(0).toISOString(),
    windowUsed: 'none',
    degraded: false,
  }
}
