// ---------------------------------------------------------------------------
// Admin data helpers tests — KeyStore, overview stats
// ---------------------------------------------------------------------------

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { KVKeyStore, getAdminOverview } from './data'

// ── Mock KV ─────────────────────────────────────────────────────────────────

function createMockKV(store: Record<string, string> = {}): KVNamespace {
  return {
    get: vi.fn(async (key: string, format?: string) => {
      const val = store[key]
      if (!val) return null
      return format === 'json' ? JSON.parse(val) : val
    }),
    put: vi.fn(async (key: string, value: string) => {
      store[key] = value
    }),
    delete: vi.fn(async (key: string) => {
      delete store[key]
    }),
    list: vi.fn(async (opts?: { prefix?: string; cursor?: string; limit?: number }) => {
      const prefix = opts?.prefix || ''
      const keys = Object.keys(store)
        .filter(k => k.startsWith(prefix))
        .map(name => ({ name, expiration: 0, metadata: null }))
      return { keys, list_complete: true, cursor: '' }
    }),
    getWithMetadata: vi.fn(),
  } as any
}

// ── KVKeyStore ──────────────────────────────────────────────────────────────

describe('KVKeyStore', () => {
  let store: Record<string, string>
  let kv: KVNamespace
  let keyStore: KVKeyStore

  beforeEach(() => {
    store = {}
    kv = createMockKV(store)
    keyStore = new KVKeyStore(kv)
  })

  describe('create', () => {
    it('should create a key with sk_ prefix', async () => {
      const result = await keyStore.create('Test Key', 'pro')
      expect(result.key).toMatch(/^sk_[a-f0-9]{32}$/)
      expect(result.entry.name).toBe('Test Key')
      expect(result.entry.tier).toBe('pro')
      expect(result.entry.active).toBe(true)
      expect(result.entry.id).toBe(result.key)
    })

    it('should store the key in KV', async () => {
      const result = await keyStore.create('Test', 'free')
      expect(kv.put).toHaveBeenCalledWith(result.key, expect.any(String))
      const stored = JSON.parse(store[result.key])
      expect(stored.name).toBe('Test')
      expect(stored.tier).toBe('free')
    })

    it('should generate unique keys', async () => {
      const keys = new Set<string>()
      for (let i = 0; i < 20; i++) {
        const result = await keyStore.create(`Key ${i}`, 'free')
        keys.add(result.key)
      }
      expect(keys.size).toBe(20)
    })

    it('should set created timestamp', async () => {
      const before = new Date().toISOString()
      const result = await keyStore.create('Test', 'free')
      const after = new Date().toISOString()
      expect(result.entry.created).toBeDefined()
      expect(result.entry.created! >= before).toBe(true)
      expect(result.entry.created! <= after).toBe(true)
    })
  })

  describe('list', () => {
    it('should return empty array when no keys', async () => {
      const keys = await keyStore.list()
      expect(keys).toEqual([])
    })

    it('should return created keys', async () => {
      await keyStore.create('Key A', 'free')
      await keyStore.create('Key B', 'pro')
      const keys = await keyStore.list()
      expect(keys.length).toBe(2)
      expect(keys.map(k => k.name).sort()).toEqual(['Key A', 'Key B'])
    })

    it('should include both active and revoked keys', async () => {
      const { key } = await keyStore.create('Active', 'free')
      await keyStore.create('Also Active', 'free')
      await keyStore.revoke(key)

      const keys = await keyStore.list()
      expect(keys.length).toBe(2)
      const revoked = keys.find(k => k.id === key)
      expect(revoked?.active).toBe(false)
    })
  })

  describe('revoke', () => {
    it('should soft-delete by setting active to false', async () => {
      const { key } = await keyStore.create('To Revoke', 'free')
      const success = await keyStore.revoke(key)
      expect(success).toBe(true)

      const stored = JSON.parse(store[key])
      expect(stored.active).toBe(false)
      expect(stored.name).toBe('To Revoke') // Name preserved
    })

    it('should return false for non-existent key', async () => {
      const success = await keyStore.revoke('sk_nonexistent')
      expect(success).toBe(false)
    })

    it('should be idempotent', async () => {
      const { key } = await keyStore.create('Test', 'free')
      await keyStore.revoke(key)
      const success = await keyStore.revoke(key)
      expect(success).toBe(true) // Still succeeds, already revoked
    })
  })
})

// ── getAdminOverview ────────────────────────────────────────────────────────

describe('getAdminOverview', () => {
  it('should return overview stats from KV data', async () => {
    const now = new Date()
    const daysAgo = (d: number) => new Date(now.getTime() - d * 86400000).toISOString()

    const trackedIndex = {
      'hot/repo1': { lastChecked: daysAgo(1), lastRequested: daysAgo(1), source: 'user', requestCount: 100 },
      'hot/repo2': { lastChecked: daysAgo(3), lastRequested: daysAgo(3), source: 'api', requestCount: 50 },
      'warm/repo1': { lastChecked: daysAgo(15), lastRequested: daysAgo(15), source: 'user', requestCount: 10 },
      'cold/repo1': { lastChecked: daysAgo(60), lastRequested: daysAgo(60), source: 'trending', requestCount: 2 },
    }

    const trending = [{ repo: 'hot/repo1' }, { repo: 'hot/repo2' }]

    const kv: Record<string, string> = {
      'isitalive:tracked': JSON.stringify(trackedIndex),
      'isitalive:trending': JSON.stringify(trending),
    }

    const mockKV = createMockKV(kv)
    const env = { CACHE_KV: mockKV } as any

    const overview = await getAdminOverview(env)
    expect(overview.trackedRepoCount).toBe(4)
    expect(overview.hotRepoCount).toBe(2)
    expect(overview.warmRepoCount).toBe(1)
    expect(overview.coldRepoCount).toBe(1)
    expect(overview.trendingCount).toBe(2)
    expect(overview.tierLimits.length).toBe(3)
  })

  it('should handle empty KV gracefully', async () => {
    const mockKV = createMockKV({})
    const env = { CACHE_KV: mockKV } as any

    const overview = await getAdminOverview(env)
    expect(overview.trackedRepoCount).toBe(0)
    expect(overview.hotRepoCount).toBe(0)
    expect(overview.trendingCount).toBe(0)
  })
})
