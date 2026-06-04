import type { Env, ApiKeyEntry } from '../types/env'
import type { RecentQuery } from '../cache/recentQueries'

type LegacyKvEnv = { CACHE_KV?: KVNamespace; KEYS_KV?: KVNamespace; WAITLIST_KV?: KVNamespace }
export type StateStore = Env | D1Database | KVNamespace | LegacyKvEnv

interface SystemCacheRow {
  value_text: string
  expires_at: number | null
}

interface AuditCacheRow {
  result_json: string
  expires_at: number
}

interface ApiKeyRow {
  key_id: string
  tier: ApiKeyEntry['tier']
  name: string
  active: number
  created: string
}

interface RecentQueryRow {
  owner: string
  repo: string
  score: number
  verdict: string
  checked_at: string
}

export interface KeyEntry extends ApiKeyEntry {
  id: string
}

function asDb(store: StateStore): D1Database | null {
  if ('prepare' in store && typeof store.prepare === 'function') {
    return store as D1Database
  }
  const maybeEnv = store as Env
  return maybeEnv.DB ?? null
}

function asKv(store: StateStore): KVNamespace | null {
  if ('get' in store && typeof store.get === 'function' && !('prepare' in store)) {
    return store as KVNamespace
  }
  return (store as LegacyKvEnv).CACHE_KV ?? null
}

function asKeysKv(store: StateStore): KVNamespace | null {
  return (store as LegacyKvEnv).KEYS_KV ?? asKv(store)
}

function asWaitlistKv(store: StateStore): KVNamespace | null {
  return (store as LegacyKvEnv).WAITLIST_KV ?? asKv(store)
}

function ttlToExpiresAt(ttlSeconds?: number): number | null {
  return ttlSeconds ? Date.now() + ttlSeconds * 1000 : null
}

function isExpired(expiresAt: number | null): boolean {
  return expiresAt !== null && expiresAt <= Date.now()
}

export async function cacheGetText(store: StateStore, key: string): Promise<string | null> {
  const db = asDb(store)
  if (db) {
    const row = await db
      .prepare('SELECT value_text, expires_at FROM system_cache WHERE cache_key = ?')
      .bind(key)
      .first<SystemCacheRow>()
    if (!row) return null
    if (isExpired(row.expires_at)) {
      await cacheDelete(store, key)
      return null
    }
    return row.value_text
  }

  const kv = asKv(store)
  return kv ? kv.get(key) : null
}

export async function cacheGetJson<T>(store: StateStore, key: string): Promise<T | null> {
  const text = await cacheGetText(store, key)
  if (!text) return null
  try {
    return JSON.parse(text) as T
  } catch {
    await cacheDelete(store, key)
    return null
  }
}

export async function cachePutText(
  store: StateStore,
  key: string,
  value: string,
  opts: { expirationTtl?: number } = {},
): Promise<void> {
  const db = asDb(store)
  if (db) {
    await db
      .prepare(`
        INSERT INTO system_cache (cache_key, value_text, stored_at, expires_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(cache_key) DO UPDATE SET
          value_text = excluded.value_text,
          stored_at = excluded.stored_at,
          expires_at = excluded.expires_at
      `)
      .bind(key, value, Date.now(), ttlToExpiresAt(opts.expirationTtl))
      .run()
    return
  }

  const kv = asKv(store)
  if (kv) await kv.put(key, value, opts)
}

export async function cachePutJson<T>(
  store: StateStore,
  key: string,
  value: T,
  opts: { expirationTtl?: number } = {},
): Promise<void> {
  await cachePutText(store, key, JSON.stringify(value), opts)
}

export async function cacheDelete(store: StateStore, key: string): Promise<void> {
  const db = asDb(store)
  if (db) {
    await db.prepare('DELETE FROM system_cache WHERE cache_key = ?').bind(key).run()
    return
  }

  const kv = asKv(store)
  if (kv) await kv.delete(key)
}

export async function auditCacheGetText(store: StateStore, key: string): Promise<string | null> {
  const db = asDb(store)
  if (db) {
    const row = await db
      .prepare('SELECT result_json, expires_at FROM audit_cache WHERE cache_key = ?')
      .bind(key)
      .first<AuditCacheRow>()
    if (!row) return null
    if (row.expires_at <= Date.now()) {
      await auditCacheDelete(store, key)
      return null
    }
    return row.result_json
  }

  return cacheGetText(store, key)
}

export async function auditCachePutText(
  store: StateStore,
  key: string,
  contentHash: string,
  value: string,
  opts: { expirationTtl?: number } = {},
): Promise<void> {
  const db = asDb(store)
  if (db) {
    const storedAt = Date.now()
    await db
      .prepare(`
        INSERT INTO audit_cache (cache_key, content_hash, result_json, stored_at, expires_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(cache_key) DO UPDATE SET
          result_json = excluded.result_json,
          stored_at = excluded.stored_at,
          expires_at = excluded.expires_at
      `)
      .bind(key, contentHash, value, storedAt, storedAt + (opts.expirationTtl ?? 0) * 1000)
      .run()
    return
  }

  await cachePutText(store, key, value, opts)
}

export async function auditCacheDelete(store: StateStore, key: string): Promise<void> {
  const db = asDb(store)
  if (db) {
    await db.prepare('DELETE FROM audit_cache WHERE cache_key = ?').bind(key).run()
    return
  }

  await cacheDelete(store, key)
}

export async function getFirstSeen(
  store: StateStore,
  provider: string,
  owner: string,
  repo: string,
): Promise<string | null> {
  const db = asDb(store)
  const normalizedOwner = owner.toLowerCase()
  const normalizedRepo = repo.toLowerCase()

  if (db) {
    const row = await db
      .prepare('SELECT first_seen FROM first_seen WHERE provider = ? AND owner = ? AND repo = ?')
      .bind(provider, normalizedOwner, normalizedRepo)
      .first<{ first_seen: string }>()
    return row?.first_seen ?? null
  }

  const kv = asKv(store)
  return kv ? kv.get(`isitalive:first-seen:${provider}/${normalizedOwner}/${normalizedRepo}`) : null
}

export async function trackFirstSeen(
  store: StateStore,
  provider: string,
  owner: string,
  repo: string,
): Promise<void> {
  const db = asDb(store)
  const normalizedOwner = owner.toLowerCase()
  const normalizedRepo = repo.toLowerCase()
  const now = new Date().toISOString()

  if (db) {
    await db
      .prepare(`
        INSERT OR IGNORE INTO first_seen (provider, owner, repo, first_seen)
        VALUES (?, ?, ?, ?)
      `)
      .bind(provider, normalizedOwner, normalizedRepo, now)
      .run()
    return
  }

  const kv = asKv(store)
  if (!kv) return
  const key = `isitalive:first-seen:${provider}/${normalizedOwner}/${normalizedRepo}`
  const existing = await kv.get(key)
  if (!existing) {
    await kv.put(key, now, { expirationTtl: 365 * 24 * 60 * 60 })
  }
}

export async function getRecentQueries(store: StateStore, limit = 10): Promise<RecentQuery[]> {
  const db = asDb(store)
  if (db) {
    const result = await db
      .prepare(`
        SELECT owner, repo, score, verdict, checked_at
        FROM recent_queries
        ORDER BY updated_at DESC
        LIMIT ?
      `)
      .bind(limit)
      .all<RecentQueryRow>()
    return result.results.map((row) => ({
      owner: row.owner,
      repo: row.repo,
      score: row.score,
      verdict: row.verdict,
      checkedAt: row.checked_at,
    }))
  }

  const kv = asKv(store)
  if (!kv) return []
  try {
    const list = await kv.get('isitalive:recent', 'json') as RecentQuery[] | null
    return list ?? []
  } catch {
    return []
  }
}

export async function trackRecentQuery(
  store: StateStore,
  entry: RecentQuery,
  limit = 10,
): Promise<void> {
  const db = asDb(store)
  const owner = entry.owner.toLowerCase()
  const repo = entry.repo.toLowerCase()
  const repoKey = `${owner}/${repo}`
  const updatedAt = new Date().toISOString()

  if (db) {
    await db
      .prepare(`
        INSERT INTO recent_queries (repo_key, owner, repo, score, verdict, checked_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(repo_key) DO UPDATE SET
          owner = excluded.owner,
          repo = excluded.repo,
          score = excluded.score,
          verdict = excluded.verdict,
          checked_at = excluded.checked_at,
          updated_at = excluded.updated_at
      `)
      .bind(repoKey, owner, repo, entry.score, entry.verdict, entry.checkedAt, updatedAt)
      .run()
    await db
      .prepare(`
        DELETE FROM recent_queries
        WHERE repo_key NOT IN (
          SELECT repo_key FROM recent_queries ORDER BY updated_at DESC LIMIT ?
        )
      `)
      .bind(limit)
      .run()
    return
  }

  const kv = asKv(store)
  if (!kv) return
  const list = await getRecentQueries(kv, limit)
  const filtered = list.filter((item) => `${item.owner}/${item.repo}`.toLowerCase() !== repoKey)
  await kv.put('isitalive:recent', JSON.stringify([entry, ...filtered].slice(0, limit)))
}

export async function getApiKey(store: StateStore, keyId: string): Promise<ApiKeyEntry | null> {
  const db = asDb(store)
  if (db) {
    const row = await db
      .prepare('SELECT key_id, tier, name, active, created FROM api_keys WHERE key_id = ?')
      .bind(keyId)
      .first<ApiKeyRow>()
    if (!row) return null
    return {
      tier: row.tier,
      name: row.name,
      active: row.active !== 0,
      created: row.created,
    }
  }

  const kv = asKeysKv(store)
  return kv ? kv.get(keyId, 'json') as Promise<ApiKeyEntry | null> : null
}

export async function listApiKeys(store: StateStore): Promise<KeyEntry[]> {
  const db = asDb(store)
  if (db) {
    const result = await db
      .prepare('SELECT key_id, tier, name, active, created FROM api_keys ORDER BY created DESC')
      .all<ApiKeyRow>()
    return result.results.map((row) => ({
      id: row.key_id,
      tier: row.tier,
      name: row.name,
      active: row.active !== 0,
      created: row.created,
    }))
  }

  const kv = asKeysKv(store)
  if (!kv) return []
  const keys: KeyEntry[] = []
  let cursor: string | undefined
  do {
    const result = await kv.list({ prefix: 'sk_', cursor, limit: 100 })
    for (const key of result.keys) {
      const entry = await kv.get(key.name, 'json') as ApiKeyEntry | null
      if (entry) keys.push({ ...entry, id: key.name })
    }
    cursor = result.list_complete ? undefined : result.cursor
  } while (cursor)
  return keys
}

export async function createApiKey(
  store: StateStore,
  name: string,
  tier: ApiKeyEntry['tier'],
): Promise<{ key: string; entry: KeyEntry }> {
  const key = `sk_${crypto.randomUUID().replace(/-/g, '')}`
  const created = new Date().toISOString()
  const entry: ApiKeyEntry = { name, tier, active: true, created }
  const db = asDb(store)

  if (db) {
    await db
      .prepare('INSERT INTO api_keys (key_id, tier, name, active, created) VALUES (?, ?, ?, 1, ?)')
      .bind(key, tier, name, created)
      .run()
  } else {
    const kv = asKeysKv(store)
    if (kv) await kv.put(key, JSON.stringify(entry))
  }

  return { key, entry: { ...entry, id: key } }
}

export async function revokeApiKey(store: StateStore, keyId: string): Promise<boolean> {
  const db = asDb(store)
  if (db) {
    const existing = await getApiKey(store, keyId)
    if (!existing) return false
    await db.prepare('UPDATE api_keys SET active = 0 WHERE key_id = ?').bind(keyId).run()
    return true
  }

  const kv = asKeysKv(store)
  if (!kv) return false
  const existing = await kv.get(keyId, 'json') as ApiKeyEntry | null
  if (!existing) return false
  existing.active = false
  await kv.put(keyId, JSON.stringify(existing))
  return true
}

export async function upsertWaitlistSignup(
  store: StateStore,
  emailHash: string,
  email: string,
  tier: string,
): Promise<void> {
  const db = asDb(store)
  const now = new Date().toISOString()

  if (db) {
    await db
      .prepare(`
        INSERT INTO waitlist_signups (email_hash, email, tier, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(email_hash) DO UPDATE SET
          email = excluded.email,
          tier = excluded.tier,
          updated_at = excluded.updated_at
      `)
      .bind(emailHash, email, tier, now, now)
      .run()
    return
  }

  const kv = asWaitlistKv(store)
  if (kv) {
    await kv.put(`waitlist:${emailHash}`, JSON.stringify({ email, tier, timestamp: now }))
  }
}

export async function getOidcQuota(
  store: StateStore,
  repository: string,
  limit: number,
): Promise<{ used: number; limit: number; period: string } | null> {
  const db = asDb(store)
  const period = new Date().toISOString().slice(0, 7)

  if (db) {
    const row = await db
      .prepare('SELECT used FROM monthly_oidc_usage WHERE period = ? AND repository = ?')
      .bind(period, repository)
      .first<{ used: number }>()
    return row ? { used: row.used, limit, period } : null
  }

  const kv = asKv(store)
  if (!kv) return null
  const quota = await kv.get(`oidc:quota:${repository}`, 'json') as { used: number; limit?: number; period: string } | null
  return quota ? { used: quota.used, limit: quota.limit ?? limit, period: quota.period } : null
}

export async function cleanupExpiredState(store: StateStore): Promise<void> {
  const db = asDb(store)
  if (!db) return
  const now = Date.now()
  await db.batch([
    db.prepare('DELETE FROM score_cache WHERE expires_at <= ?').bind(now),
    db.prepare('DELETE FROM audit_cache WHERE expires_at <= ?').bind(now),
    db.prepare('DELETE FROM system_cache WHERE expires_at IS NOT NULL AND expires_at <= ?').bind(now),
  ])
}
