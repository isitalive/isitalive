import { describe, expect, it } from 'vitest'
import type { TrackedIndex } from '../aggregate/tracked'
import type { DiscoveredIndex } from './discovered'
import { buildRefreshCandidates } from './refresh-plan'

describe('refresh plan', () => {
  it('includes discovered repos that are not user tracked', () => {
    const candidates = buildRefreshCandidates({}, {
      'new/repo': {
        repo: 'new/repo',
        provider: 'github',
        source: 'github-trending',
        firstDiscovered: '2026-06-01T00:00:00.000Z',
        lastDiscovered: '2026-06-04T00:00:00.000Z',
        lastRefreshed: null,
        refreshCount: 0,
        tier: 'hot',
      },
    } satisfies DiscoveredIndex)

    expect(candidates).toEqual([
      expect.objectContaining({
        repo: 'new/repo',
        reason: 'discovered',
        tier: 'hot',
      }),
    ])
  })

  it('keeps the stricter tracked cadence when a repo is both tracked and discovered', () => {
    const tracked = {
      'owner/repo': {
        repo: 'owner/repo',
        lastSeen: '2026-06-04T00:00:00.000Z',
        requestCount: 10,
        tier: 'hot',
      },
    } satisfies TrackedIndex
    const discovered = {
      'owner/repo': {
        repo: 'owner/repo',
        provider: 'github',
        source: 'github-trending',
        firstDiscovered: '2026-05-01T00:00:00.000Z',
        lastDiscovered: '2026-05-01T00:00:00.000Z',
        lastRefreshed: null,
        refreshCount: 0,
        tier: 'cold',
      },
    } satisfies DiscoveredIndex

    expect(buildRefreshCandidates(tracked, discovered)).toEqual([
      expect.objectContaining({
        repo: 'owner/repo',
        reason: 'tracked',
        tier: 'hot',
      }),
    ])
  })
})
