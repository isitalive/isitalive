import { describe, it, expect, vi, beforeEach } from 'vitest'

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

function createMockD1(resultSets: Array<Array<{ repo: string; checks: number; score: number; verdict: string }>>) {
  const writes: Array<{ sql: string; values: unknown[] }> = []
  const reads: Array<{ sql: string; values: unknown[] }> = []
  const prepare = vi.fn((sql: string) => ({
    bind: (...values: unknown[]) => ({
      all: vi.fn(async () => {
        reads.push({ sql, values })
        return { results: resultSets.shift() ?? [], success: true, meta: {} }
      }),
      run: vi.fn(async () => {
        writes.push({ sql, values })
        return { results: [], success: true, meta: {} }
      }),
    }),
  }))

  return { db: { prepare } as unknown as D1Database, reads, writes, prepare }
}

describe('aggregate/trending', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('queries D1 daily rollups for 24h trending checks on the first window', async () => {
    const { db, reads, writes } = createMockD1([
      [{ repo: 'vercel/next.js', checks: 42, score: 91.7, verdict: 'healthy' }],
    ])

    const result = await refreshTrending({ DB: db } as any)

    expect(reads).toHaveLength(1)
    expect(reads[0].sql).toContain('FROM daily_usage_repo')
    expect(reads[0].sql).toContain('GROUP BY repo')
    expect(reads[0].values[0]).toEqual(expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/))
    expect(result).toEqual([
      { repo: 'vercel/next.js', score: 92, verdict: 'healthy' },
    ])
    expect(writes).toHaveLength(1)
    expect(writes[0].sql).toContain('INSERT INTO system_cache')
    expect(writes[0].values[0]).toBe(TRENDING_KEY)
    expect(JSON.parse(writes[0].values[1] as string).windowUsed).toBe('24 hours')
  })

  it('widens window tiers until one returns rows and flags the result as degraded', async () => {
    const { db, reads, writes } = createMockD1([
      [],
      [{ repo: 'cloudflare/workers-sdk', checks: 5, score: 88, verdict: 'healthy' }],
    ])

    const result = await refreshTrending({ DB: db } as any)

    expect(reads).toHaveLength(2)
    expect(result).toEqual([
      { repo: 'cloudflare/workers-sdk', score: 88, verdict: 'healthy' },
    ])
    expect(JSON.parse(writes[0].values[1] as string).windowUsed).toBe('7 days')
    expect(JSON.parse(writes[0].values[1] as string).degraded).toBe(true)
  })

  it('returns cached trending when no D1 binding is available', async () => {
    const cached = [{ repo: 'cloudflare/workers-sdk', score: 88, verdict: 'healthy' }]
    const kv = createMockKV({ [TRENDING_KEY]: JSON.stringify(cached) })

    await expect(refreshTrending({ CACHE_KV: kv } as any)).resolves.toEqual(cached)
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
