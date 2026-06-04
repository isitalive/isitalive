import { describe, expect, it, vi } from 'vitest'
import { getRecentQueries, trackRecentQuery, type RecentQuery } from './recentQueries'

const missingRecentQueriesTable = new Error('D1_ERROR: no such table: recent_queries: SQLITE_ERROR')
const missingRecentQueriesTableMessage = 'D1_ERROR: no such table: recent_queries: SQLITE_ERROR'

function createReadDb(error: unknown): D1Database {
  return {
    prepare: vi.fn(() => ({
      bind: vi.fn(() => ({
        all: vi.fn(async () => {
          throw error
        }),
      })),
    })),
  } as unknown as D1Database
}

function createWriteDb(error: unknown): D1Database {
  return {
    prepare: vi.fn(() => ({
      bind: vi.fn(() => ({
        run: vi.fn(async () => {
          throw error
        }),
      })),
    })),
  } as unknown as D1Database
}

const entry: RecentQuery = {
  owner: 'Vercel',
  repo: 'Next.js',
  score: 92,
  verdict: 'healthy',
  checkedAt: '2026-06-04T12:00:00.000Z',
}

describe('recent query D1 fallback', () => {
  it('returns an empty list when the optional recent_queries table is missing', async () => {
    await expect(getRecentQueries(createReadDb(missingRecentQueriesTable))).resolves.toEqual([])
  })

  it('skips tracking when the optional recent_queries table is missing', async () => {
    await expect(trackRecentQuery(createWriteDb(missingRecentQueriesTable), entry)).resolves.toBeUndefined()
  })

  it('handles non-Error missing-table throws', async () => {
    await expect(getRecentQueries(createReadDb(missingRecentQueriesTableMessage))).resolves.toEqual([])
    await expect(
      trackRecentQuery(createWriteDb({ message: missingRecentQueriesTableMessage }), entry),
    ).resolves.toBeUndefined()
  })

  it('still surfaces unrelated D1 read errors', async () => {
    await expect(getRecentQueries(createReadDb(new Error('D1_ERROR: disk I/O error')))).rejects.toThrow('disk I/O')
  })

  it('still surfaces unrelated D1 write errors', async () => {
    await expect(trackRecentQuery(createWriteDb(new Error('D1_ERROR: disk I/O error')), entry)).rejects.toThrow('disk I/O')
  })
})
