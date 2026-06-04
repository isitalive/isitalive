import { describe, expect, it, vi } from 'vitest'

import {
  d1ReplicationDiagnostic,
  readPrimarySession,
  readReplicaSafeSession,
} from './d1'

function createSession(bookmark: string | null = 'bookmark-1'): D1DatabaseSession {
  return {
    prepare: vi.fn(),
    batch: vi.fn(),
    getBookmark: vi.fn(() => bookmark),
  } as unknown as D1DatabaseSession
}

describe('db/d1 sessions', () => {
  it('uses first-unconstrained sessions for replica-safe reads', () => {
    const session = createSession()
    const db = {
      withSession: vi.fn(() => session),
    } as unknown as D1Database

    expect(readReplicaSafeSession(db)).toBe(session)
    expect(db.withSession).toHaveBeenCalledWith('first-unconstrained')
  })

  it('uses first-primary sessions for latest-sensitive reads', () => {
    const session = createSession()
    const db = {
      withSession: vi.fn(() => session),
    } as unknown as D1Database

    expect(readPrimarySession(db)).toBe(session)
    expect(db.withSession).toHaveBeenCalledWith('first-primary')
  })

  it('falls back to the original DB object when sessions are unavailable', () => {
    const db = { prepare: vi.fn() } as unknown as D1Database

    expect(readReplicaSafeSession(db)).toBe(db)
    expect(readPrimarySession(db)).toBe(db)
  })

  it('extracts D1 replication metadata and session bookmarks', () => {
    const session = createSession('bookmark-after-query')
    const result = {
      success: true,
      results: [],
      meta: {
        duration: 1,
        size_after: 0,
        rows_read: 1,
        rows_written: 0,
        last_row_id: 0,
        changed_db: false,
        changes: 0,
        served_by_region: 'WEUR',
        served_by_primary: false,
      },
    } as D1Result<unknown>

    expect(d1ReplicationDiagnostic(session, result)).toEqual({
      served_by_region: 'WEUR',
      served_by_primary: false,
      bookmark: 'bookmark-after-query',
    })
  })
})
