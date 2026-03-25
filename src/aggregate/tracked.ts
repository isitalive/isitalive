// ---------------------------------------------------------------------------
// Aggregate: Tracked — derive tracked repos from Iceberg, cache in KV
//
// Replaces the queue consumer's TrackedIndex maintenance.
// The RefreshWorkflow reads this to decide which repos to refresh.
// ---------------------------------------------------------------------------

import type { Env } from '../scoring/types'
import { queryR2SQL } from '../admin/r2sql'
import { TRACKED_KEY } from '../state/keys'

/** Tracked repo entry (cached in KV) */
export interface TrackedRepo {
  repo: string
  lastSeen: string
  requestCount: number
  /** Refresh tier derived from lastSeen age */
  tier: 'hot' | 'warm' | 'cold'
}

/** Full tracked index (repo slug → TrackedRepo) */
export type TrackedIndex = Record<string, TrackedRepo>

const TRACKED_SQL = `
SELECT
  project,
  MAX(timestamp) as last_seen,
  COUNT(*) as request_count
FROM result_events_v2
WHERE timestamp > NOW() - INTERVAL '90 days'
  AND project != ''
GROUP BY project
ORDER BY request_count DESC
`

/** Classify a repo into a refresh tier based on last-seen age */
function classifyTier(lastSeen: string): TrackedRepo['tier'] {
  const ageMs = Date.now() - new Date(lastSeen).getTime()
  if (ageMs <= 7 * 24 * 3600 * 1000) return 'hot'
  if (ageMs <= 30 * 24 * 3600 * 1000) return 'warm'
  return 'cold'
}

/**
 * Query Iceberg for all tracked repos (seen in last 90d) and cache in KV.
 * Called by the cron handler every 10 minutes.
 */
export async function refreshTracked(env: Env): Promise<TrackedIndex> {
  const result = await queryR2SQL(env, TRACKED_SQL)

  if (result.error) {
    console.error('Aggregate: tracked query failed:', result.error)
    return getTrackedIndex(env.CACHE_KV)
  }

  const index: TrackedIndex = {}
  for (const row of result.rows) {
    const repo = String(row[0])
    const lastSeen = String(row[1])
    index[repo] = {
      repo,
      lastSeen,
      requestCount: Number(row[2]),
      tier: classifyTier(lastSeen),
    }
  }

  await env.CACHE_KV.put(TRACKED_KEY, JSON.stringify(index), {
    expirationTtl: 86400 * 2, // 2d safety net
  })

  return index
}

/**
 * Read cached tracked index from KV.
 */
export async function getTrackedIndex(kv: KVNamespace): Promise<TrackedIndex> {
  try {
    const data = await kv.get(TRACKED_KEY, 'json') as TrackedIndex | null
    return data ?? {}
  } catch {
    return {}
  }
}

/** Maximum staleness before a repo needs refreshing (by tier) */
export const TIER_STALENESS: Record<TrackedRepo['tier'], number> = {
  hot: 1 * 3600 * 1000,   // 1 hour
  warm: 6 * 3600 * 1000,  // 6 hours
  cold: 24 * 3600 * 1000, // 24 hours
}
