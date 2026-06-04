// ---------------------------------------------------------------------------
// Aggregate: Trending — derive trending repos from D1 daily rollups
// ---------------------------------------------------------------------------

import type { Env } from '../types/env'
import { TRENDING_KEY } from '../state/keys'
import { cacheGetJson, cachePutJson, type StateStore } from '../db/state'

/** Trending repo entry (consumed by UI) */
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

const WINDOW_TIERS = [
  { label: '24 hours', days: 1 },
  { label: '7 days', days: 7 },
  { label: '30 days', days: 30 },
  { label: '90 days', days: 90 },
] as const

type WindowLabel = (typeof WINDOW_TIERS)[number]['label']

interface TrendingRow {
  repo: string
  checks: number
  score: number
  verdict: string
}

function dbFrom(store: StateStore): D1Database | null {
  if ('prepare' in store && typeof store.prepare === 'function') return store as D1Database
  return (store as Env).DB ?? null
}

function sinceDay(days: number): string {
  const date = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
  return date.toISOString().slice(0, 10)
}

async function queryTrending(db: D1Database, days: number): Promise<TrendingRepo[]> {
  const result = await db
    .prepare(`
      SELECT
        repo,
        SUM(checks) as checks,
        MAX(latest_score) as score,
        MAX(latest_verdict) as verdict
      FROM daily_usage_repo
      WHERE day >= ?
        AND repo != ''
        AND source != 'cron'
      GROUP BY repo
      ORDER BY checks DESC
      LIMIT 250
    `)
    .bind(sinceDay(days))
    .all<TrendingRow>()

  return result.results.map((row) => ({
    repo: row.repo,
    score: Math.round(Number(row.score)),
    verdict: String(row.verdict),
  }))
}

/**
 * Refresh trending from D1 daily rollups. Keeps a small system-cache copy as a
 * last-known-good fallback for local tests and transient D1 read errors.
 */
export async function refreshTrending(env: Env): Promise<TrendingRepo[]> {
  const db = dbFrom(env)
  if (!db) return getTrending(env)

  for (const window of WINDOW_TIERS) {
    const repos = await queryTrending(db, window.days)
    if (repos.length === 0) continue

    const payload: TrendingCache = {
      repos,
      generatedAt: new Date().toISOString(),
      windowUsed: window.label,
      degraded: window.label !== '24 hours',
    }

    await cachePutJson(env, TRENDING_KEY, payload, { expirationTtl: 7200 })
    return repos
  }

  return getTrending(env)
}

export async function getTrending(store: StateStore): Promise<TrendingRepo[]> {
  const cache = await getTrendingCache(store)
  return cache.repos
}

export async function getTrendingCache(store: StateStore): Promise<TrendingCache> {
  const db = dbFrom(store)
  if (db) {
    for (const window of WINDOW_TIERS) {
      const repos = await queryTrending(db, window.days)
      if (repos.length > 0) {
        return {
          repos,
          generatedAt: new Date().toISOString(),
          windowUsed: window.label as WindowLabel,
          degraded: window.label !== '24 hours',
        }
      }
    }
  }

  const raw = await cacheGetJson<TrendingCache | TrendingRepo[]>(store, TRENDING_KEY)
  if (!raw) return emptyCache()
  if (Array.isArray(raw)) {
    return {
      repos: raw,
      generatedAt: new Date(0).toISOString(),
      windowUsed: '24 hours',
      degraded: false,
    }
  }
  return raw
}

function emptyCache(): TrendingCache {
  return {
    repos: [],
    generatedAt: new Date(0).toISOString(),
    windowUsed: 'none',
    degraded: false,
  }
}
