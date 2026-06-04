import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  getDiscoveredIndex,
  markDiscoveredRepoRefreshed,
  normalizeRepoSlug,
  recordDiscoveredRepos,
} from './discovered'
import type { Env } from '../types/env'

describe('discovered repos', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('normalizes valid repo slugs and rejects non-repo paths', () => {
    expect(normalizeRepoSlug('GitHub/Hello-World')).toBe('github/hello-world')
    expect(normalizeRepoSlug('/owner/repo')).toBe('owner/repo')
    expect(normalizeRepoSlug('owner')).toBeNull()
    expect(normalizeRepoSlug('owner/repo/issues')).toBeNull()
    expect(normalizeRepoSlug('owner/re po')).toBeNull()
  })

  it('records unique discovered repos into D1', async () => {
    vi.setSystemTime(new Date('2026-06-04T12:00:00.000Z'))
    const statements: Array<{ sql: string; values: unknown[] }> = []
    const db = {
      prepare: vi.fn((sql: string) => ({
        bind: (...values: unknown[]) => {
          statements.push({ sql, values })
          return { sql, values }
        },
      })),
      batch: vi.fn(async () => []),
    } as unknown as D1Database

    const count = await recordDiscoveredRepos(
      { DB: db } as Env,
      'github',
      ['Owner/Repo', 'owner/repo', 'Other/Project', 'not-a-repo'],
      'github-trending',
    )

    expect(count).toBe(2)
    expect(db.batch).toHaveBeenCalledOnce()
    expect(statements.map((stmt) => stmt.values.slice(0, 3))).toEqual([
      ['github', 'owner/repo', 'github-trending'],
      ['github', 'other/project', 'github-trending'],
    ])
    expect(statements[0].values[3]).toBe('2026-06-04T12:00:00.000Z')
    expect(statements[0].sql).toContain('INSERT INTO discovered_repos')
  })

  it('maps discovered rows into tiered refresh index', async () => {
    vi.setSystemTime(new Date('2026-06-04T12:00:00.000Z'))
    const db = {
      prepare: vi.fn(() => ({
        all: vi.fn(async () => ({
          results: [
            {
              provider: 'github',
              repo: 'hot/repo',
              source: 'github-trending',
              first_discovered: '2026-06-03T12:00:00.000Z',
              last_discovered: '2026-06-03T12:00:00.000Z',
              last_refreshed: null,
              refresh_count: 0,
            },
            {
              provider: 'github',
              repo: 'warm/repo',
              source: 'github-trending',
              first_discovered: '2026-05-20T12:00:00.000Z',
              last_discovered: '2026-05-20T12:00:00.000Z',
              last_refreshed: '2026-05-21T12:00:00.000Z',
              refresh_count: 2,
            },
            {
              provider: 'github',
              repo: 'cold/repo',
              source: 'github-trending',
              first_discovered: '2026-01-01T12:00:00.000Z',
              last_discovered: '2026-01-01T12:00:00.000Z',
              last_refreshed: null,
              refresh_count: 0,
            },
          ],
        })),
      })),
    } as unknown as D1Database

    const index = await getDiscoveredIndex({ DB: db } as Env)

    expect(index['hot/repo'].tier).toBe('hot')
    expect(index['warm/repo'].tier).toBe('warm')
    expect(index['warm/repo'].refreshCount).toBe(2)
    expect(index['cold/repo'].tier).toBe('cold')
  })

  it('marks discovered repos refreshed without creating undiscovered rows', async () => {
    vi.setSystemTime(new Date('2026-06-04T12:00:00.000Z'))
    const run = vi.fn(async () => ({ success: true }))
    const bind = vi.fn(() => ({ run }))
    const db = {
      prepare: vi.fn(() => ({ bind })),
    } as unknown as D1Database

    await markDiscoveredRepoRefreshed({ DB: db } as Env, 'github', 'Owner/Repo')

    expect(bind).toHaveBeenCalledWith('2026-06-04T12:00:00.000Z', 'github', 'owner/repo')
    expect(run).toHaveBeenCalledOnce()
  })
})
