// ---------------------------------------------------------------------------
// Aggregate: Sitemap — derive sitemap repo list from D1 daily usage rollups
// ---------------------------------------------------------------------------

import type { Env } from '../types/env'
import { SITEMAP_KEY } from '../state/keys'
import { cacheGetJson, cachePutJson, type StateStore } from '../db/state'

interface SitemapRow {
  repo: string
  checks: number
}

function dbFrom(store: StateStore): D1Database | null {
  if ('prepare' in store && typeof store.prepare === 'function') return store as D1Database
  return (store as Env).DB ?? null
}

function sinceDay(days: number): string {
  const date = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
  return date.toISOString().slice(0, 10)
}

async function querySitemap(db: D1Database): Promise<string[]> {
  const result = await db
    .prepare(`
      SELECT repo, SUM(checks) as checks
      FROM daily_usage_repo
      WHERE day >= ?
        AND repo != ''
        AND source != 'cron'
      GROUP BY repo
      ORDER BY checks DESC
      LIMIT 5000
    `)
    .bind(sinceDay(90))
    .all<SitemapRow>()

  return result.results.map((row) => row.repo)
}

export async function refreshSitemap(env: Env): Promise<string[]> {
  const db = dbFrom(env)
  if (!db) return getSitemapRepos(env)

  const repos = await querySitemap(db)
  await cachePutJson(env, SITEMAP_KEY, repos, { expirationTtl: 172800 })
  return repos
}

export async function getSitemapRepos(store: StateStore): Promise<string[]> {
  const db = dbFrom(store)
  if (db) return querySitemap(db)

  return await cacheGetJson<string[]>(store, SITEMAP_KEY) ?? []
}
