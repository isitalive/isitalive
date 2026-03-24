// ---------------------------------------------------------------------------
// Aggregate: History — derive score history from Iceberg, cache in KV
//
// Replaces the KV-maintained score history in ingest/processor.ts.
// Each repo's trend data is queried from result_events on demand and cached.
// ---------------------------------------------------------------------------

import type { Env } from '../scoring/types'
import { queryR2SQL } from '../admin/r2sql'
import { historyKey } from '../state/keys'

/** Score snapshot — one data point per day */
export interface ScoreSnapshot {
  date: string     // YYYY-MM-DD
  score: number    // 0-100
  verdict: string  // e.g. "healthy"
}

export type TrendDirection = 'improving' | 'stable' | 'declining'

export interface Trend {
  direction: TrendDirection | null
  delta: number
  dataPoints: number
  daySpan: number
  minDaysRequired: number
}

const MIN_TREND_DAYS = 7
const TREND_THRESHOLD = 5

/**
 * Get score history for a repo. Reads from KV cache first,
 * falls back to Iceberg query if not cached.
 */
export async function getScoreHistory(
  env: Env,
  owner: string,
  repo: string,
): Promise<ScoreSnapshot[]> {
  const key = historyKey(owner, repo)

  // Try KV cache first
  try {
    const cached = await env.CACHE_KV.get(key, 'json') as ScoreSnapshot[] | null
    if (cached && cached.length > 0) return cached
  } catch {}

  // Query Iceberg
  const repoSlug = `${owner}/${repo}`.toLowerCase()
  const sql = `
    SELECT
      DATE(timestamp) as day,
      CAST(AVG(score) AS INTEGER) as score,
      MAX(verdict) as verdict
    FROM result_events_v2
    WHERE project = '${repoSlug}'
      AND timestamp > NOW() - INTERVAL '90 days'
    GROUP BY day
    ORDER BY day
  `

  const result = await queryR2SQL(env, sql)
  if (result.error || result.rows.length === 0) {
    return []
  }

  const history: ScoreSnapshot[] = result.rows.map(row => ({
    date: String(row[0]),
    score: Number(row[1]),
    verdict: String(row[2]),
  }))

  // Cache for 6 hours (refreshed by cron daily snapshot)
  await env.CACHE_KV.put(key, JSON.stringify(history), {
    expirationTtl: 21600,
  })

  return history
}

/**
 * Compute a trend from score history.
 * Requires at least 7 days of data span before producing a direction.
 */
export function computeTrend(history: ScoreSnapshot[]): Trend {
  const sorted = [...history].sort((a, b) => a.date.localeCompare(b.date))

  if (sorted.length < 2) {
    return { direction: null, delta: 0, dataPoints: sorted.length, daySpan: 0, minDaysRequired: MIN_TREND_DAYS }
  }

  const firstDate = new Date(sorted[0].date)
  const lastDate = new Date(sorted[sorted.length - 1].date)
  const daySpan = Math.round((lastDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24))

  if (daySpan < MIN_TREND_DAYS) {
    return { direction: null, delta: 0, dataPoints: sorted.length, daySpan, minDaysRequired: MIN_TREND_DAYS }
  }

  const third = Math.max(1, Math.floor(sorted.length / 3))
  const earlyAvg = sorted.slice(0, third).reduce((s, h) => s + h.score, 0) / third
  const lateAvg = sorted.slice(-third).reduce((s, h) => s + h.score, 0) / third
  const delta = Math.round(lateAvg - earlyAvg)

  let direction: TrendDirection
  if (delta >= TREND_THRESHOLD) direction = 'improving'
  else if (delta <= -TREND_THRESHOLD) direction = 'declining'
  else direction = 'stable'

  return { direction, delta, dataPoints: sorted.length, daySpan, minDaysRequired: MIN_TREND_DAYS }
}
