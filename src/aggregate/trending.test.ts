import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../admin/r2sql', () => ({
  queryR2SQL: vi.fn(),
}))

import { queryR2SQL } from '../admin/r2sql'
import { refreshTrending, getTrending, getTrendingCache } from './trending'
import { TRENDING_KEY } from '../state/keys'

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
    delete: vi.fn(async () => {}),
    list: vi.fn(async () => ({ keys: [], list_complete: true, cursor: '' })),
    getWithMetadata: vi.fn(),
  } as any
}

function emptyResult() {
  return { columns: [], rows: [] as any[][], rowCount: 0, timing: 1 }
}

describe('aggregate/trending', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('queries usage_events for 24h trending checks on the first (primary) window', async () => {
    const store: Record<string, string> = {}
    const kv = createMockKV(store)

    vi.mocked(queryR2SQL).mockResolvedValueOnce({
      columns: ['repo', 'checks', 'score', 'verdict'],
      rows: [['vercel/next.js', 42, 91.7, 'healthy']],
      rowCount: 1,
      timing: 10,
    })

    const env = { CACHE_KV: kv } as any
    const result = await refreshTrending(env)

    // First tier returned rows, so no fallback queries run.
    expect(queryR2SQL).toHaveBeenCalledTimes(1)
    const sql = vi.mocked(queryR2SQL).mock.calls[0][1]
    expect(sql).toContain('FROM usage_events')
    expect(sql).toContain("WHERE timestamp > NOW() - INTERVAL '24 hours'")
    expect(sql).toContain('GROUP BY repo')

    expect(result).toEqual([
      { repo: 'vercel/next.js', score: 92, verdict: 'healthy' },
    ])

    // Cache writes the wrapper shape now, not the bare array.
    expect(kv.put).toHaveBeenCalledTimes(1)
    const [key, value, opts] = vi.mocked(kv.put).mock.calls[0] as any
    expect(key).toBe(TRENDING_KEY)
    expect(opts).toEqual({ expirationTtl: 7200 })
    const cached = JSON.parse(value as string)
    expect(cached.repos).toEqual(result)
    expect(cached.windowUsed).toBe('24 hours')
    expect(cached.degraded).toBe(false)
    expect(cached.generatedAt).toEqual(expect.any(String))
  })

  it('widens window tiers until one returns rows and flags the result as degraded', async () => {
    const kv = createMockKV({})

    vi.mocked(queryR2SQL)
      .mockResolvedValueOnce(emptyResult())  // 24 hours → empty
      .mockResolvedValueOnce({                 // 7 days → hit
        columns: ['repo', 'checks', 'score', 'verdict'],
        rows: [['cloudflare/workers-sdk', 5, 88, 'healthy']],
        rowCount: 1,
        timing: 12,
      })

    const env = { CACHE_KV: kv } as any
    const result = await refreshTrending(env)

    expect(queryR2SQL).toHaveBeenCalledTimes(2)
    expect(vi.mocked(queryR2SQL).mock.calls[1][1]).toContain("INTERVAL '7 days'")
    expect(result).toEqual([
      { repo: 'cloudflare/workers-sdk', score: 88, verdict: 'healthy' },
    ])

    const cached = JSON.parse((vi.mocked(kv.put).mock.calls[0] as any)[1])
    expect(cached.windowUsed).toBe('7 days')
    expect(cached.degraded).toBe(true)
  })

  it('falls back to cached trending when every window query fails and never overwrites KV', async () => {
    const cached = [{ repo: 'cloudflare/workers-sdk', score: 88, verdict: 'healthy' }]
    const store: Record<string, string> = {
      [TRENDING_KEY]: JSON.stringify(cached),
    }
    const kv = createMockKV(store)

    vi.mocked(queryR2SQL).mockResolvedValue({
      columns: [],
      rows: [],
      rowCount: 0,
      timing: 1,
      error: 'boom',
    })

    const env = { CACHE_KV: kv } as any
    const result = await refreshTrending(env)

    // Every tier was tried before giving up.
    expect(queryR2SQL).toHaveBeenCalledTimes(4)
    expect(result).toEqual(cached)
    // Last-known-good must be preserved — no empty write allowed.
    expect(kv.put).not.toHaveBeenCalled()
  })

  it('preserves last-known-good when every window returns zero rows', async () => {
    const cached = [{ repo: 'cloudflare/workers-sdk', score: 88, verdict: 'healthy' }]
    const store: Record<string, string> = {
      [TRENDING_KEY]: JSON.stringify(cached),
    }
    const kv = createMockKV(store)

    vi.mocked(queryR2SQL).mockResolvedValue(emptyResult())

    const env = { CACHE_KV: kv } as any
    const result = await refreshTrending(env)

    expect(queryR2SQL).toHaveBeenCalledTimes(4)
    expect(result).toEqual(cached)
    expect(kv.put).not.toHaveBeenCalled()
  })

  it('returns empty array when cached trending is missing', async () => {
    const kv = createMockKV({})
    await expect(getTrending(kv)).resolves.toEqual([])
  })

  it('getTrendingCache transparently upgrades legacy bare-array KV payloads', async () => {
    const legacy = [{ repo: 'cloudflare/workers-sdk', score: 88, verdict: 'healthy' }]
    const kv = createMockKV({ [TRENDING_KEY]: JSON.stringify(legacy) })

    const cache = await getTrendingCache(kv)
    expect(cache.repos).toEqual(legacy)
    expect(cache.windowUsed).toBe('24 hours')
    expect(cache.degraded).toBe(false)
  })
})
