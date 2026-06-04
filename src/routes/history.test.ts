import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../admin/r2sql', () => ({
  queryR2SQL: vi.fn(),
}))

import { queryR2SQL } from '../admin/r2sql'
import { app } from '../app'
import { legacyHistoryKey } from '../state/keys'

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

const executionCtx: ExecutionContext = {
  waitUntil: (_promise: Promise<unknown>) => {},
  passThroughOnException: () => {},
  props: {},
}

describe('/_data/history route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns R2-derived aggregate history instead of stale legacy-only KV history', async () => {
    vi.mocked(queryR2SQL).mockResolvedValueOnce({
      columns: ['day', 'score', 'verdict'],
      rows: [
        ['2026-06-01', 89, 'healthy'],
        ['2026-06-02', 91, 'healthy'],
      ],
      rowCount: 2,
      timing: 12,
    })

    const response = await app.fetch(
      new Request('https://isitalive.dev/_data/history/github/Vercel/Next.js'),
      {
        CACHE_KV: createMockKV({
          [legacyHistoryKey('vercel', 'next.js')]: JSON.stringify([
            { date: '2026-05-19', score: 100, verdict: 'healthy' },
          ]),
        }),
      } as any,
      executionCtx,
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      history: [
        { date: '2026-06-01', score: 89, verdict: 'healthy' },
        { date: '2026-06-02', score: 91, verdict: 'healthy' },
      ],
    })

    expect(queryR2SQL).toHaveBeenCalledTimes(1)
    const sql = vi.mocked(queryR2SQL).mock.calls[0][1]
    expect(sql).toContain("WHERE project = 'vercel/next.js'")
  })
})
