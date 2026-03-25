// ---------------------------------------------------------------------------
// Aggregate: Trending — derive trending repos from Iceberg, cache in KV
//
// Replaces the queue consumer's real-time trending counter maintenance.
// Cron runs this every 10 min → queries Iceberg → caches in KV.
// ---------------------------------------------------------------------------

import type { Env } from '../scoring/types'
import { queryR2SQL } from '../admin/r2sql'
import { TRENDING_KEY } from '../state/keys'

/** Trending repo entry (cached in KV, consumed by UI) */
export interface TrendingRepo {
  repo: string
  score: number
  verdict: string
}
// R2 SQL limitations: no JOINs, no subqueries in FROM clause.
// Use flat GROUP BY with MAX() for latest score/verdict approximation.
// This is accurate enough since scores rarely change within 24h.
const TRENDING_SQL = `
SELECT
  project,
  COUNT(*) as checks,
  MAX(score) as score,
  MAX(verdict) as verdict
FROM result_events_v2
WHERE timestamp > NOW() - INTERVAL '24 hours'
  AND project != ''
GROUP BY project
ORDER BY checks DESC
LIMIT 250
`

/**
 * Query Iceberg for trending repos and cache the result in KV.
 * Called by the cron handler every 10 minutes.
 */
export async function refreshTrending(env: Env): Promise<TrendingRepo[]> {
  const result = await queryR2SQL(env, TRENDING_SQL)

  if (result.error) {
    console.error('Aggregate: trending query failed:', result.error)
    // Fall back to cached data
    return getTrending(env.CACHE_KV)
  }

  const trending: TrendingRepo[] = result.rows.map(row => ({
    repo: String(row[0]),
    // row[1] = checks — used for ORDER BY but not exposed in API
    score: Math.round(Number(row[2])),
    verdict: String(row[3]),
  }))

  await env.CACHE_KV.put(TRENDING_KEY, JSON.stringify(trending), {
    expirationTtl: 7200, // 2h safety net (refreshed every 10 min)
  })

  return trending
}

/**
 * Read cached trending data from KV.
 */
export async function getTrending(kv: KVNamespace): Promise<TrendingRepo[]> {
  try {
    const data = await kv.get(TRENDING_KEY, 'json') as TrendingRepo[] | null
    return data ?? []
  } catch {
    return []
  }
}
