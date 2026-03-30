import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../admin/r2sql', () => ({
  queryR2SQL: vi.fn(),
}))

import { queryR2SQL } from '../admin/r2sql'
import { refreshTrending, getTrending } from './trending'
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

describe('aggregate/trending', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('queries usage_events for 24h trending checks', async () => {
    const store: Record<string, string> = {}
    const kv = createMockKV(store)

    vi.mocked(queryR2SQL).mockResolvedValue({
      columns: ['repo', 'checks', 'score', 'verdict'],
      rows: [['vercel/next.js', 42, 91.7, 'healthy']],
      rowCount: 1,
      timing: 10,
    })

    const env = { CACHE_KV: kv } as any
    const result = await refreshTrending(env)

    expect(queryR2SQL).toHaveBeenCalledTimes(1)
    const sql = vi.mocked(queryR2SQL).mock.calls[0][1]
    expect(sql).toContain('FROM usage_events')
    expect(sql).toContain("WHERE timestamp > NOW() - INTERVAL '24 hours'")
    expect(sql).toContain('GROUP BY repo')

    expect(result).toEqual([
      { repo: 'vercel/next.js', score: 92, verdict: 'healthy' },
    ])

    expect(kv.put).toHaveBeenCalledWith(
      TRENDING_KEY,
      JSON.stringify(result),
      { expirationTtl: 7200 },
    )
  })

  it('falls back to cached trending when query fails', async () => {
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

    expect(result).toEqual(cached)
    expect(kv.put).not.toHaveBeenCalled()
  })

  it('returns empty array when cached trending is missing', async () => {
    const kv = createMockKV({})
    await expect(getTrending(kv)).resolves.toEqual([])
  })
})
