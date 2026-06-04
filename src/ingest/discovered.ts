import type { Env } from '../types/env'

export type DiscoveredTier = 'hot' | 'warm' | 'cold'

export interface DiscoveredRepo {
  repo: string
  provider: string
  source: string
  firstDiscovered: string
  lastDiscovered: string
  lastRefreshed: string | null
  refreshCount: number
  tier: DiscoveredTier
}

export type DiscoveredIndex = Record<string, DiscoveredRepo>

interface DiscoveredRepoRow {
  provider: string
  repo: string
  source: string
  first_discovered: string
  last_discovered: string
  last_refreshed: string | null
  refresh_count: number
}

const REPO_SEGMENT_RE = /^[a-z0-9_.-]+$/i

export const DISCOVERED_TIER_STALENESS: Record<DiscoveredTier, number> = {
  hot: 24 * 3600 * 1000,
  warm: 3 * 24 * 3600 * 1000,
  cold: 7 * 24 * 3600 * 1000,
}

function dbFrom(env: Env): D1Database | null {
  return env.DB ?? null
}

export function normalizeRepoSlug(repo: string): string | null {
  const [owner, name, extra] = repo.trim().replace(/^\/+/, '').split('/')
  if (!owner || !name || extra) return null
  if (!REPO_SEGMENT_RE.test(owner) || !REPO_SEGMENT_RE.test(name)) return null
  return `${owner.toLowerCase()}/${name.toLowerCase()}`
}

function classifyDiscoveredTier(lastDiscovered: string): DiscoveredTier {
  const ageMs = Date.now() - new Date(lastDiscovered).getTime()
  if (ageMs <= 7 * 24 * 3600 * 1000) return 'hot'
  if (ageMs <= 30 * 24 * 3600 * 1000) return 'warm'
  return 'cold'
}

export async function recordDiscoveredRepos(
  env: Env,
  provider: string,
  repos: string[],
  source: string,
): Promise<number> {
  const db = dbFrom(env)
  if (!db || repos.length === 0) return 0

  const now = new Date().toISOString()
  const normalized = [...new Set(repos
    .map(normalizeRepoSlug)
    .filter((repo): repo is string => repo !== null))]

  if (normalized.length === 0) return 0

  try {
    await db.batch(normalized.map((repo) => db
      .prepare(`
        INSERT INTO discovered_repos (
          provider, repo, source, first_discovered, last_discovered, active
        )
        VALUES (?, ?, ?, ?, ?, 1)
        ON CONFLICT(provider, repo) DO UPDATE SET
          source = excluded.source,
          last_discovered = excluded.last_discovered,
          active = 1
      `)
      .bind(provider, repo, source, now, now)))
    return normalized.length
  } catch (err) {
    console.error('Discovered repos: failed to record feed results:', err)
    return 0
  }
}

export async function markDiscoveredRepoRefreshed(
  env: Env,
  provider: string,
  repo: string,
): Promise<void> {
  const db = dbFrom(env)
  const normalized = normalizeRepoSlug(repo)
  if (!db || !normalized) return

  try {
    await db
      .prepare(`
        UPDATE discovered_repos
        SET last_refreshed = ?,
            refresh_count = refresh_count + 1
        WHERE provider = ?
          AND repo = ?
      `)
      .bind(new Date().toISOString(), provider, normalized)
      .run()
  } catch (err) {
    console.error(`Discovered repos: failed to mark ${normalized} refreshed:`, err)
  }
}

export async function getDiscoveredIndex(env: Env): Promise<DiscoveredIndex> {
  const db = dbFrom(env)
  if (!db) return {}

  const result = await db
    .prepare(`
      SELECT provider, repo, source, first_discovered, last_discovered, last_refreshed, refresh_count
      FROM discovered_repos
      WHERE active = 1
      ORDER BY last_discovered DESC
    `)
    .all<DiscoveredRepoRow>()

  const index: DiscoveredIndex = {}
  for (const row of result.results) {
    index[row.repo] = {
      repo: row.repo,
      provider: row.provider,
      source: row.source,
      firstDiscovered: row.first_discovered,
      lastDiscovered: row.last_discovered,
      lastRefreshed: row.last_refreshed,
      refreshCount: Number(row.refresh_count),
      tier: classifyDiscoveredTier(row.last_discovered),
    }
  }
  return index
}
