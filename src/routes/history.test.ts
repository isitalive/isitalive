import { describe, it, expect, vi, beforeEach } from 'vitest'

import { app } from '../app'

function createMockD1(resultRows: Array<{ day: string; score: number; verdict: string }> = []) {
  const reads: Array<{ sql: string; values: unknown[] }> = []

  const prepare = vi.fn((sql: string) => ({
    bind: (...values: unknown[]) => ({
      all: vi.fn(async () => {
        reads.push({ sql, values })
        return { results: resultRows, success: true, meta: {} }
      }),
    }),
  }))

  return { db: { prepare } as unknown as D1Database, reads, prepare }
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

  it('returns D1-derived aggregate score history', async () => {
    const { db, reads } = createMockD1([
      { day: '2026-06-02', score: 91, verdict: 'healthy' },
      { day: '2026-06-01', score: 89, verdict: 'healthy' },
    ])

    const response = await app.fetch(
      new Request('https://isitalive.dev/_data/history/github/Vercel/Next.js'),
      { DB: db } as any,
      executionCtx,
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      history: [
        { date: '2026-06-01', score: 89, verdict: 'healthy' },
        { date: '2026-06-02', score: 91, verdict: 'healthy' },
      ],
    })

    expect(reads).toHaveLength(1)
    expect(reads[0].sql).toContain('FROM daily_result_scores')
    expect(reads[0].values).toEqual(['vercel/next.js', 365])
  })
})
