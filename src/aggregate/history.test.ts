import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../admin/r2sql', () => ({
  queryR2SQL: vi.fn(),
}))

import { queryR2SQL } from '../admin/r2sql'
import { getScoreHistory, computeTrend } from './history'
import { historyKey, legacyHistoryKey } from '../state/keys'

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

function makeEnv(store: Record<string, string> = {}) {
  return { CACHE_KV: createMockKV(store) } as any
}

describe('aggregate/history', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns the new aggregate KV cache without querying R2 SQL', async () => {
    const cached = [
      { date: '2026-06-01', score: 90, verdict: 'healthy' },
      { date: '2026-06-02', score: 91, verdict: 'healthy' },
    ]
    const env = makeEnv({
      [historyKey('Vercel', 'Next.js')]: JSON.stringify(cached),
    })

    await expect(getScoreHistory(env, 'Vercel', 'Next.js')).resolves.toEqual(cached)
    expect(queryR2SQL).not.toHaveBeenCalled()
  })

  it('queries result_events_v2 with R2-compatible day bucketing and caches rows', async () => {
    vi.mocked(queryR2SQL).mockResolvedValueOnce({
      columns: ['day', 'score', 'verdict'],
      rows: [
        ['2026-06-01', 88, 'healthy'],
        ['2026-06-02', 92, 'healthy'],
      ],
      rowCount: 2,
      timing: 10,
    })

    const env = makeEnv()
    const history = await getScoreHistory(env, 'Vercel', 'Next.js')

    expect(history).toEqual([
      { date: '2026-06-01', score: 88, verdict: 'healthy' },
      { date: '2026-06-02', score: 92, verdict: 'healthy' },
    ])

    expect(queryR2SQL).toHaveBeenCalledTimes(1)
    const sql = vi.mocked(queryR2SQL).mock.calls[0][1]
    expect(sql).toContain('substring(timestamp, 1, 10) as day')
    expect(sql).not.toContain('DATE(')
    expect(sql).toContain('FROM result_events_v2')
    expect(sql).toContain("WHERE project = 'vercel/next.js'")

    expect(env.CACHE_KV.put).toHaveBeenCalledTimes(1)
    const [key, value, options] = vi.mocked(env.CACHE_KV.put).mock.calls[0] as any
    expect(key).toBe(historyKey('Vercel', 'Next.js'))
    expect(JSON.parse(value)).toEqual(history)
    expect(options).toEqual({ expirationTtl: 21600 })
  })

  it('falls back to legacy KV history when the R2 query errors', async () => {
    const legacy = [
      { date: '2026-05-18', score: 99, verdict: 'healthy' },
      { date: '2026-05-19', score: 100, verdict: 'healthy' },
    ]
    const env = makeEnv({
      [legacyHistoryKey('vercel', 'next.js')]: JSON.stringify(legacy),
    })

    vi.mocked(queryR2SQL).mockResolvedValueOnce({
      columns: [],
      rows: [],
      rowCount: 0,
      timing: 1,
      error: 'R2 SQL unavailable',
    })

    await expect(getScoreHistory(env, 'vercel', 'next.js')).resolves.toEqual(legacy)
    expect(env.CACHE_KV.put).not.toHaveBeenCalled()
  })

  it('falls back to legacy KV history when R2 returns no rows', async () => {
    const legacy = [
      { date: '2026-04-18', score: 99, verdict: 'healthy' },
    ]
    const env = makeEnv({
      [legacyHistoryKey('zitadel', 'zitadel')]: JSON.stringify(legacy),
    })

    vi.mocked(queryR2SQL).mockResolvedValueOnce({
      columns: [],
      rows: [],
      rowCount: 0,
      timing: 1,
    })

    await expect(getScoreHistory(env, 'zitadel', 'zitadel')).resolves.toEqual(legacy)
    expect(env.CACHE_KV.put).not.toHaveBeenCalled()
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
