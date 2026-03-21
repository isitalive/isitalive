// ---------------------------------------------------------------------------
// Result Events — computed health scores and signal breakdowns
//
// "What we calculated" — the scored output for a repo.
// One event per scoring (fresh fetch or cron snapshot).
// Enables time-series analysis of score trends across the platform.
// ---------------------------------------------------------------------------

import type { Event } from './envelope'
import { createEvent } from './envelope'
import type { ProviderName, Verdict, ScoringResult, SignalResult } from '../scoring/types'

/** Payload for a result event */
export interface ResultEventData {
  provider: ProviderName
  owner: string
  repo: string
  score: number
  verdict: Verdict
  /** Stringified signal array (kept as string for Iceberg) */
  signals_json: string
  /** Whether this result came from cache */
  cached: boolean
  /** Source: 'api' | 'browser' | 'badge' | 'cron' | 'cron-daily' | 'github-app' */
  source: string
}

export type ResultEvent = Event<'result', ResultEventData>

/** Build a result event from a ScoringResult */
export function buildResultEvent(
  result: ScoringResult,
  source: string,
): ResultEvent {
  const [, owner, repo] = result.project.split('/')
  return createEvent('result', {
    provider: result.provider,
    owner: owner?.toLowerCase() ?? '',
    repo: repo?.toLowerCase() ?? '',
    score: result.score,
    verdict: result.verdict,
    signals_json: JSON.stringify(result.signals),
    cached: result.cached,
    source,
  })
}
