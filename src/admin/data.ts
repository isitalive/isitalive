// ---------------------------------------------------------------------------
// Admin data helpers — server-side functions for admin dashboards
//
// Reads from KV / R2 and returns structured data for the admin UI.
// Keeps route handlers thin — they just call these + render templates.
// ---------------------------------------------------------------------------

import type { Env, ApiKeyEntry } from '../scoring/types'
import { getTrackedIndex, type TrackedIndex } from '../queue/tracked'

// ---------------------------------------------------------------------------
// Overview stats
// ---------------------------------------------------------------------------

export interface AdminOverview {
  trackedRepoCount: number
  hotRepoCount: number
  warmRepoCount: number
  coldRepoCount: number
  trendingCount: number
  /** Rate limit tier config — code-defined, PR-reviewable */
  tierLimits: { tier: string; limit: number; period: number }[]
}

const TRENDING_KV_KEY = 'isitalive:trending'

export async function getAdminOverview(env: Env): Promise<AdminOverview> {
  const [tracked, trending] = await Promise.all([
    getTrackedIndex(env.CACHE_KV),
    env.CACHE_KV.get(TRENDING_KV_KEY, 'json') as Promise<any[] | null>,
  ])

  const now = Date.now()
  let hot = 0, warm = 0, cold = 0
  for (const entry of Object.values(tracked)) {
    const age = now - new Date(entry.lastRequested).getTime()
    if (age <= 7 * 86400000) hot++
    else if (age <= 30 * 86400000) warm++
    else cold++
  }

  return {
    trackedRepoCount: Object.keys(tracked).length,
    hotRepoCount: hot,
    warmRepoCount: warm,
    coldRepoCount: cold,
    trendingCount: trending?.length ?? 0,
    tierLimits: [
      { tier: 'free', limit: 60, period: 60 },
      { tier: 'pro', limit: 120, period: 60 },
      { tier: 'enterprise', limit: 600, period: 60 },
    ],
  }
}

// ---------------------------------------------------------------------------
// API Key management — pluggable KeyStore interface
// ---------------------------------------------------------------------------

export interface KeyEntry extends ApiKeyEntry {
  /** The key ID (sk_...) — only returned on list, NOT the full secret */
  id: string
}

export interface KeyStore {
  list(): Promise<KeyEntry[]>
  create(name: string, tier: ApiKeyEntry['tier']): Promise<{ key: string; entry: KeyEntry }>
  revoke(keyId: string): Promise<boolean>
}

/**
 * KV-backed key store — initial implementation.
 * Keys stored in KEYS_KV with sk_ prefix.
 * Future: swap with StripeKeyStore without changing admin UI/API.
 */
export class KVKeyStore implements KeyStore {
  constructor(private kv: KVNamespace) {}

  async list(): Promise<KeyEntry[]> {
    const keys: KeyEntry[] = []
    let cursor: string | undefined

    // Paginate through all sk_ prefixed keys
    do {
      const result = await this.kv.list({ prefix: 'sk_', cursor, limit: 100 })
      for (const key of result.keys) {
        const entry = await this.kv.get(key.name, 'json') as ApiKeyEntry | null
        if (entry) {
          keys.push({ ...entry, id: key.name })
        }
      }
      cursor = result.list_complete ? undefined : result.cursor
    } while (cursor)

    return keys
  }

  async create(name: string, tier: ApiKeyEntry['tier']): Promise<{ key: string; entry: KeyEntry }> {
    const key = `sk_${crypto.randomUUID().replace(/-/g, '')}`
    const entry: ApiKeyEntry = {
      name,
      tier,
      active: true,
      created: new Date().toISOString(),
    }

    await this.kv.put(key, JSON.stringify(entry))

    return { key, entry: { ...entry, id: key } }
  }

  async revoke(keyId: string): Promise<boolean> {
    const existing = await this.kv.get(keyId, 'json') as ApiKeyEntry | null
    if (!existing) return false

    existing.active = false
    await this.kv.put(keyId, JSON.stringify(existing))
    return true
  }
}

// ---------------------------------------------------------------------------
// Tracked repos — for display in admin
// ---------------------------------------------------------------------------

export interface TrackedRepoDisplay {
  repo: string
  lastChecked: string
  lastRequested: string
  source: string
  requestCount: number
}

export async function getTrackedRepos(env: Env): Promise<TrackedRepoDisplay[]> {
  const index = await getTrackedIndex(env.CACHE_KV)
  return Object.entries(index)
    .map(([repo, entry]) => ({
      repo,
      ...entry,
    }))
    .sort((a, b) => b.requestCount - a.requestCount)
    .slice(0, 200) // Cap at 200 for display
}
