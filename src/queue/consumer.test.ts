import { describe, expect, it, vi } from 'vitest'

import { createEvent } from '../events/envelope'
import type { UsageEvent } from '../events/usage'
import type { QueuedAnalyticsEvent } from '../pipeline/types'
import { handleEventQueue, pruneArchivedHotEvents } from './consumer'

interface MockStatement {
  sql: string
  values: unknown[]
}

function usageEvent(id = 'usage-1'): UsageEvent {
  return {
    ...createEvent('usage', {
      repo: 'owner/repo',
      provider: 'github',
      score: 91,
      verdict: 'healthy',
      source: 'api',
      api_key: 'anon',
      cache_status: 'l3-miss',
      country: 'US',
      user_agent: 'browser',
      response_time_ms: 42,
      ip_hash: 'hash',
      oidc_repository: null,
      oidc_owner: null,
    }),
    id,
    timestamp: '2026-06-04T12:34:56.000Z',
  }
}

function message(body: QueuedAnalyticsEvent): Message<QueuedAnalyticsEvent> {
  return { body } as Message<QueuedAnalyticsEvent>
}

function batch(messages: Message<QueuedAnalyticsEvent>[]): MessageBatch<QueuedAnalyticsEvent> {
  return { messages, queue: 'isitalive-events', retryAll: vi.fn(), ackAll: vi.fn() } as any
}

function createMockD1() {
  const ingested = new Set<string>()
  const prepared: MockStatement[] = []
  let lastChanges = 0
  const state = {
    archiveRows: 0,
    usageRows: 0,
    dailyUsageChecks: 0,
  }

  const db = {
    prepare: vi.fn((sql: string) => ({
      bind: (...values: unknown[]) => {
        const statement = { sql, values }
        prepared.push(statement)
        return statement
      },
    })),
    batch: vi.fn(async (statements: MockStatement[]) => {
      for (const statement of statements) {
        if (statement.sql.includes('INSERT INTO archive_batches')) {
          state.archiveRows += 1
          lastChanges = 1
          continue
        }

        if (statement.sql.includes('INSERT OR IGNORE INTO event_ingest')) {
          const id = String(statement.values[0])
          lastChanges = ingested.has(id) ? 0 : 1
          ingested.add(id)
          continue
        }

        if (statement.sql.includes('INSERT INTO usage_events')) {
          if (lastChanges === 1) {
            state.usageRows += 1
            lastChanges = 1
          } else {
            lastChanges = 0
          }
          continue
        }

        if (statement.sql.includes('INSERT INTO daily_usage_repo')) {
          if (lastChanges === 1) {
            state.dailyUsageChecks += 1
            lastChanges = 1
          } else {
            lastChanges = 0
          }
        }
      }

      return statements.map(() => ({ results: [], success: true, meta: {} }))
    }),
  }

  return { db: db as unknown as D1Database, prepared, state, batchSpy: db.batch }
}

describe('queue consumer', () => {
  it('archives to R2 before writing D1 rows and aggregates', async () => {
    const { db, state, batchSpy } = createMockD1()
    const put = vi.fn(async () => null)
    const event = usageEvent()

    await handleEventQueue(
      batch([message({ domain: 'usage', event })]),
      { DB: db, DATA_BUCKET: { put } } as any,
    )

    expect(put).toHaveBeenCalledOnce()
    const firstPut = put.mock.calls[0] as unknown as [string, string]
    expect(firstPut[0]).toContain('events/raw/type=usage/dt=2026-06-04/hour=12/')
    expect(batchSpy).toHaveBeenCalledOnce()
    expect(state.archiveRows).toBe(1)
    expect(state.usageRows).toBe(1)
    expect(state.dailyUsageChecks).toBe(1)
  })

  it('does not write D1 when the R2 archive write fails', async () => {
    const { db, batchSpy } = createMockD1()
    const put = vi.fn(async () => { throw new Error('r2 down') })
    const event = usageEvent()

    await expect(handleEventQueue(
      batch([message({ domain: 'usage', event })]),
      { DB: db, DATA_BUCKET: { put } } as any,
    )).rejects.toThrow('r2 down')

    expect(batchSpy).not.toHaveBeenCalled()
  })

  it('dedupes repeated event IDs before incrementing D1 aggregates', async () => {
    const { db, state } = createMockD1()
    const put = vi.fn(async () => null)
    const event = usageEvent('same-event-id')

    await handleEventQueue(
      batch([
        message({ domain: 'usage', event }),
        message({ domain: 'usage', event }),
      ]),
      { DB: db, DATA_BUCKET: { put } } as any,
    )

    expect(state.usageRows).toBe(1)
    expect(state.dailyUsageChecks).toBe(1)
  })

  it('prunes hot rows only behind the archived watermark', async () => {
    const { db, prepared, batchSpy } = createMockD1()

    await pruneArchivedHotEvents({ DB: db } as any, 30)

    expect(batchSpy).toHaveBeenCalledOnce()
    expect(prepared).toHaveLength(4)
    for (const statement of prepared) {
      expect(statement.sql).toContain('DELETE FROM')
      expect(statement.sql).toContain('archive_batches')
      expect(statement.values[0]).toEqual(expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/))
    }
  })
})
