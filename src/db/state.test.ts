import { describe, expect, it, vi } from 'vitest'

import {
  cacheGetText,
  cachePutText,
  cleanupExpiredState,
  getApiKey,
  getOidcQuota,
  listApiKeys,
} from './state'

type QueryLabel = 'base' | 'replica' | 'primary'

interface QueryCall {
  sql: string
  values: unknown[]
}

function createQueryable(
  label: QueryLabel,
  calls: Record<QueryLabel, QueryCall[]>,
  firstRows: unknown[] = [],
  allRows: unknown[][] = [],
) {
  const prepare = vi.fn((sql: string) => {
    let values: unknown[] = []
    let recorded = false
    const record = () => {
      if (recorded) return
      calls[label].push({ sql, values })
      recorded = true
    }
    const statement = {
      bind: (...next: unknown[]) => {
        values = next
        return statement
      },
      first: vi.fn(async () => {
        record()
        return firstRows.shift() ?? null
      }),
      all: vi.fn(async () => {
        record()
        return { success: true, results: allRows.shift() ?? [], meta: {} }
      }),
      run: vi.fn(async () => {
        record()
        return { success: true, results: [], meta: {} }
      }),
    }
    return statement
  })
  return { prepare }
}

function createMockD1(options: {
  replicaFirstRows?: unknown[]
  primaryFirstRows?: unknown[]
  primaryAllRows?: unknown[][]
} = {}) {
  const calls: Record<QueryLabel, QueryCall[]> = {
    base: [],
    replica: [],
    primary: [],
  }
  const base = createQueryable('base', calls)
  const replica = createQueryable('replica', calls, options.replicaFirstRows)
  const primary = createQueryable('primary', calls, options.primaryFirstRows, options.primaryAllRows)
  const batch = vi.fn(async () => [])
  const withSession = vi.fn((constraint?: D1SessionBookmark | D1SessionConstraint) => {
    return constraint === 'first-primary'
      ? primary as unknown as D1DatabaseSession
      : replica as unknown as D1DatabaseSession
  })
  const db = {
    prepare: base.prepare,
    batch,
    withSession,
  } as unknown as D1Database

  return { db, calls, base, replica, primary, batch, withSession }
}

describe('db/state D1 session routing', () => {
  it('reads system cache through a replica session', async () => {
    const { db, calls, base, replica, withSession } = createMockD1({
      replicaFirstRows: [{ value_text: 'cached-value', expires_at: Date.now() + 60_000 }],
    })

    await expect(cacheGetText({ DB: db } as any, 'cache-key')).resolves.toBe('cached-value')

    expect(withSession).toHaveBeenCalledWith('first-unconstrained')
    expect(replica.prepare).toHaveBeenCalledOnce()
    expect(base.prepare).not.toHaveBeenCalled()
    expect(calls.replica[0].sql).toContain('FROM system_cache')
  })

  it('reads API key data through primary sessions', async () => {
    const { db, calls, base, primary, withSession } = createMockD1({
      primaryFirstRows: [{
        key_id: 'sk_test',
        tier: 'pro',
        name: 'Test key',
        active: 1,
        created: '2026-06-04T00:00:00.000Z',
      }],
      primaryAllRows: [[{
        key_id: 'sk_other',
        tier: 'free',
        name: 'Other key',
        active: 1,
        created: '2026-06-03T00:00:00.000Z',
      }]],
    })

    await expect(getApiKey({ DB: db } as any, 'sk_test')).resolves.toMatchObject({
      tier: 'pro',
      active: true,
    })
    await expect(listApiKeys({ DB: db } as any)).resolves.toEqual([{
      id: 'sk_other',
      tier: 'free',
      name: 'Other key',
      active: true,
      created: '2026-06-03T00:00:00.000Z',
    }])

    expect(withSession).toHaveBeenCalledWith('first-primary')
    expect(primary.prepare).toHaveBeenCalledTimes(2)
    expect(base.prepare).not.toHaveBeenCalled()
    expect(calls.primary[0].sql).toContain('FROM api_keys')
    expect(calls.primary[1].sql).toContain('FROM api_keys')
  })

  it('reads OIDC quota through a primary session', async () => {
    const { db, calls, withSession } = createMockD1({
      primaryFirstRows: [{ used: 42 }],
    })

    await expect(getOidcQuota({ DB: db } as any, 'owner/repo', 500)).resolves.toMatchObject({
      used: 42,
      limit: 500,
    })

    expect(withSession).toHaveBeenCalledWith('first-primary')
    expect(calls.primary[0].sql).toContain('FROM monthly_oidc_usage')
  })

  it('keeps state writes and cleanup batches on the base DB binding', async () => {
    const { db, base, batch, withSession } = createMockD1()

    await cachePutText({ DB: db } as any, 'cache-key', 'value', { expirationTtl: 60 })
    await cleanupExpiredState({ DB: db } as any)

    expect(withSession).not.toHaveBeenCalled()
    expect(base.prepare).toHaveBeenCalledTimes(4)
    expect(batch).toHaveBeenCalledOnce()
  })
})
