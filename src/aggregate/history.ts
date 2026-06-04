// ---------------------------------------------------------------------------
// Aggregate: History — score history from D1 daily result rollups
// ---------------------------------------------------------------------------

import type { Env } from '../types/env'
import { historyKey } from '../state/keys'
import { cacheGetJson, cachePutJson, type StateStore } from '../db/state'
import { readReplicaSession } from '../db/d1'

/** Score snapshot — one data point per day */
export interface ScoreSnapshot {
  date: string
  score: number
  verdict: string
}

export type TrendDirection = 'improving' | 'stable' | 'declining'

export interface Trend {
  direction: TrendDirection | null
  delta: number
  dataPoints: number
  daySpan: number
  minDaysRequired: number
}

interface HistoryRow {
  day: string
  score: number
  verdict: string
}

const MIN_TREND_DAYS = 7
const TREND_THRESHOLD = 5
const SCORE_HISTORY_MAX = 365

function dbFrom(store: StateStore): D1Database | null {
  if ('prepare' in store && typeof store.prepare === 'function') return store as D1Database
  return (store as Env).DB ?? null
}

export async function appendScoreHistory(
  store: StateStore,
  repoSlug: string,
  snapshot: ScoreSnapshot,
): Promise<void> {
  const db = dbFrom(store)
  if (db) {
    // D1 daily_result_scores is written by the queue consumer so result events
    // and cron snapshots cannot double-count the same score.
    return
  }

  const key = historyKeyFromRepo(repoSlug)
  const history = await getHistoryFromCache(store, key)
  const deduped = history.filter((item) => item.date !== snapshot.date)
  deduped.push(snapshot)
  const trimmed = deduped.slice(Math.max(0, deduped.length - SCORE_HISTORY_MAX))
  await cachePutJson(store, key, trimmed, { expirationTtl: 86400 * 400 })
}

export async function getScoreHistory(
  store: StateStore,
  owner: string,
  repo: string,
): Promise<ScoreSnapshot[]> {
  const db = dbFrom(store)
  const repoSlug = `${owner}/${repo}`.toLowerCase()

  if (db) {
    const reader = readReplicaSession(db)
    const result = await reader
      .prepare(`
        SELECT
          day,
          ROUND(score_sum * 1.0 / score_count) as score,
          latest_verdict as verdict
        FROM daily_result_scores
        WHERE project = ?
        ORDER BY day DESC
        LIMIT ?
      `)
      .bind(repoSlug, SCORE_HISTORY_MAX)
      .all<HistoryRow>()

    return result.results
      .map((row) => ({
        date: row.day,
        score: Number(row.score),
        verdict: row.verdict,
      }))
      .reverse()
  }

  return getHistoryFromCache(store, historyKey(owner, repo))
}

async function getHistoryFromCache(store: StateStore, key: string): Promise<ScoreSnapshot[]> {
  return await cacheGetJson<ScoreSnapshot[]>(store, key) ?? []
}

function historyKeyFromRepo(repoSlug: string): string {
  const [owner, repo] = repoSlug.split('/')
  return historyKey(owner ?? '', repo ?? '')
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
  const earlyAvg = sorted.slice(0, third).reduce((sum, item) => sum + item.score, 0) / third
  const lateAvg = sorted.slice(-third).reduce((sum, item) => sum + item.score, 0) / third
  const delta = Math.round(lateAvg - earlyAvg)

  let direction: TrendDirection
  if (delta >= TREND_THRESHOLD) direction = 'improving'
  else if (delta <= -TREND_THRESHOLD) direction = 'declining'
  else direction = 'stable'

  return { direction, delta, dataPoints: sorted.length, daySpan, minDaysRequired: MIN_TREND_DAYS }
}
