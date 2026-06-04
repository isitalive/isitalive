import { describe, it, expect, vi, beforeEach } from 'vitest'

import { appendScoreHistory, getScoreHistory, computeTrend } from './history'
import { historyKey } from '../state/keys'

function createMockKV(store: Record<string, string> = {}): KVNamespace {
  return {
    get: vi.fn(async (key: string, format?: string) => {
      const value = store[key]
      if (!value) return null
      return format === 'json' ? JSON.parse(value) : value
    }),
    put: vi.fn(async (key: string, value: string) => {
      store[key] = value
    }),
    delete: vi.fn(async () => {}),
    list: vi.fn(async () => ({ keys: [], list_complete: true, cursor: '' })),
    getWithMetadata: vi.fn(),
  } as any
}

function createMockD1(resultRows: Array<{ day: string; score: number; verdict: string }> = []) {
  const reads: Array<{ sql: string; values: unknown[] }> = []
  const writes: Array<{ sql: string; values: unknown[] }> = []

  const prepare = vi.fn((sql: string) => ({
    bind: (...values: unknown[]) => ({
      all: vi.fn(async () => {
        reads.push({ sql, values })
        return { results: resultRows, success: true, meta: {} }
      }),
      run: vi.fn(async () => {
        writes.push({ sql, values })
        return { success: true, meta: {} }
      }),
    }),
  }))

  return { db: { prepare } as unknown as D1Database, reads, writes, prepare }
}

describe('aggregate/history', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('reads D1 daily result rollups in chronological order', async () => {
    const { db, reads } = createMockD1([
      { day: '2026-06-02', score: 92, verdict: 'healthy' },
      { day: '2026-06-01', score: 88, verdict: 'healthy' },
    ])

    await expect(getScoreHistory({ DB: db } as any, 'Vercel', 'Next.js')).resolves.toEqual([
      { date: '2026-06-01', score: 88, verdict: 'healthy' },
      { date: '2026-06-02', score: 92, verdict: 'healthy' },
    ])

    expect(reads).toHaveLength(1)
    expect(reads[0].sql).toContain('FROM daily_result_scores')
    expect(reads[0].values).toEqual(['vercel/next.js', 365])
  })

  it('leaves D1 daily result rollups to the queue consumer', async () => {
    const { db, writes, prepare } = createMockD1()

    await appendScoreHistory({ DB: db } as any, 'Vercel/Next.js', {
      date: '2026-06-04',
      score: 91,
      verdict: 'healthy',
    })

    expect(prepare).not.toHaveBeenCalled()
    expect(writes).toHaveLength(0)
  })

  it('falls back to state cache when no D1 binding is available', async () => {
    const cached = [
      { date: '2026-06-01', score: 90, verdict: 'healthy' },
      { date: '2026-06-02', score: 91, verdict: 'healthy' },
    ]
    const kv = createMockKV({
      [historyKey('Vercel', 'Next.js')]: JSON.stringify(cached),
    })

    await expect(getScoreHistory({ CACHE_KV: kv } as any, 'Vercel', 'Next.js')).resolves.toEqual(cached)
  })

  it('dedupes cache fallback snapshots by day when appending without D1', async () => {
    const kv = createMockKV({
      [historyKey('vercel', 'next.js')]: JSON.stringify([
        { date: '2026-06-01', score: 80, verdict: 'stable' },
        { date: '2026-06-02', score: 88, verdict: 'healthy' },
      ]),
    })

    await appendScoreHistory({ CACHE_KV: kv } as any, 'vercel/next.js', {
      date: '2026-06-02',
      score: 91,
      verdict: 'healthy',
    })

    const [, value, options] = vi.mocked(kv.put).mock.calls[0]
    expect(JSON.parse(String(value))).toEqual([
      { date: '2026-06-01', score: 80, verdict: 'stable' },
      { date: '2026-06-02', score: 91, verdict: 'healthy' },
    ])
    expect(options).toEqual({ expirationTtl: 86400 * 400 })
  })

  it('computes trend from aggregate score history', () => {
    expect(computeTrend([
      { date: '2026-06-01', score: 80, verdict: 'stable' },
      { date: '2026-06-05', score: 86, verdict: 'healthy' },
      { date: '2026-06-10', score: 94, verdict: 'healthy' },
    ])).toMatchObject({
      direction: 'improving',
      delta: 14,
      daySpan: 9,
    })
  })
})
