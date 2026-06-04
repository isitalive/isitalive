import {
  TIER_STALENESS,
  type TrackedIndex,
  type TrackedRepo,
} from '../aggregate/tracked'
import {
  DISCOVERED_TIER_STALENESS,
  type DiscoveredIndex,
  type DiscoveredTier,
} from './discovered'

export type RefreshReason = 'tracked' | 'discovered'

export interface RefreshCandidate {
  repo: string
  tier: TrackedRepo['tier'] | DiscoveredTier
  reason: RefreshReason
  maxStalenessMs: number
}

function setCandidate(candidates: Map<string, RefreshCandidate>, candidate: RefreshCandidate) {
  const existing = candidates.get(candidate.repo)
  if (existing && existing.maxStalenessMs <= candidate.maxStalenessMs) return
  candidates.set(candidate.repo, candidate)
}

export function buildRefreshCandidates(
  trackedIndex: TrackedIndex,
  discoveredIndex: DiscoveredIndex,
): RefreshCandidate[] {
  const candidates = new Map<string, RefreshCandidate>()

  for (const [repo, entry] of Object.entries(trackedIndex)) {
    setCandidate(candidates, {
      repo,
      tier: entry.tier,
      reason: 'tracked',
      maxStalenessMs: TIER_STALENESS[entry.tier],
    })
  }

  for (const [repo, entry] of Object.entries(discoveredIndex)) {
    setCandidate(candidates, {
      repo,
      tier: entry.tier,
      reason: 'discovered',
      maxStalenessMs: DISCOVERED_TIER_STALENESS[entry.tier],
    })
  }

  return [...candidates.values()]
}
