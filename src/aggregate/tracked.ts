// ---------------------------------------------------------------------------
// Aggregate: Tracked — derive refresh set from D1 daily usage rollups
// ---------------------------------------------------------------------------

import type { Env } from '../types/env'
import { TRACKED_KEY } from '../state/keys'
import { cacheGetJson, cachePutJson, type StateStore } from '../db/state'
import { readReplicaSafeSession, type D1Queryable } from '../db/d1'

export interface TrackedRepo {
  repo: string
  lastSeen: string
  requestCount: number
  /** Refresh tier derived from lastSeen age */
  tier: 'hot' | 'warm' | 'cold'
}

export type TrackedIndex = Record<string, TrackedRepo>

interface TrackedRow {
  repo: string
  last_seen: string
  request_count: number
}

function dbFrom(store: StateStore): D1Database | null {
  if ('prepare' in store && typeof store.prepare === 'function') return store as D1Database
  return (store as Env).DB ?? null
}

function sinceDay(days: number): string {
  const date = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
  return date.toISOString().slice(0, 10)
}

/** Classify a repo into a refresh tier based on last-seen age */
function classifyTier(lastSeen: string): TrackedRepo['tier'] {
  const ageMs = Date.now() - new Date(lastSeen).getTime()
  if (ageMs <= 7 * 24 * 3600 * 1000) return 'hot'
  if (ageMs <= 30 * 24 * 3600 * 1000) return 'warm'
  return 'cold'
}

async function queryTracked(db: D1Queryable): Promise<TrackedIndex> {
  const result = await db
    .prepare(`
      SELECT
        repo,
        MAX(last_seen) as last_seen,
        SUM(checks) as request_count
      FROM daily_usage_repo
      WHERE day >= ?
        AND repo != ''
        AND source != 'cron'
      GROUP BY repo
      ORDER BY request_count DESC
    `)
    .bind(sinceDay(30))
    .all<TrackedRow>()

  const index: TrackedIndex = {}
  for (const row of result.results) {
    index[row.repo] = {
      repo: row.repo,
      lastSeen: row.last_seen,
      requestCount: Number(row.request_count),
      tier: classifyTier(row.last_seen),
    }
  }
  return index
}

export async function refreshTracked(env: Env): Promise<TrackedIndex> {
  const db = dbFrom(env)
  if (!db) return getTrackedIndex(env)

  const index = await queryTracked(readReplicaSafeSession(db))
  await cachePutJson(env, TRACKED_KEY, index, { expirationTtl: 86400 * 2 })
  return index
}

export async function getTrackedIndex(store: StateStore): Promise<TrackedIndex> {
  const db = dbFrom(store)
  if (db) return queryTracked(readReplicaSafeSession(db))

  return await cacheGetJson<TrackedIndex>(store, TRACKED_KEY) ?? {}
}

/** Maximum staleness before a repo needs refreshing (by tier) */
export const TIER_STALENESS: Record<TrackedRepo['tier'], number> = {
  hot: 1 * 3600 * 1000,
  warm: 6 * 3600 * 1000,
  cold: 24 * 3600 * 1000,
}
