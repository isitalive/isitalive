// ---------------------------------------------------------------------------
// Result Events — computed health scores and signal breakdowns
//
// "What we calculated" — the scored output for a repo.
// One event per scoring (fresh fetch or cron snapshot).
// Enables time-series analysis of score trends across the platform.
//
// v2: Flattened from signals_json string blob into individual typed
//     signal columns for efficient Parquet columnar compression.
// ---------------------------------------------------------------------------

import type { Event } from './envelope'
import { createEvent } from './envelope'
import type { Verdict, ScoringResult, SignalResult } from '../scoring/types'

/** Payload for a result event — flattened signal scores */
export interface ResultEventData {
  /** Full project path: "owner/repo" */
  project: string
  score: number
  verdict: Verdict
  /** Source: 'api' | 'browser' | 'badge' | 'cron' | 'cron-daily' | 'github-app' */
  source: string
  // Per-signal scores (0-100) and display values
  signal_last_commit_score: number | null
  signal_last_commit_value: string | null
  signal_last_release_score: number | null
  signal_last_release_value: string | null
  signal_issue_staleness_score: number | null
  signal_issue_staleness_value: string | null
  signal_pr_responsiveness_score: number | null
  signal_pr_responsiveness_value: string | null
  signal_recent_contributors_score: number | null
  signal_recent_contributors_value: string | null
  signal_stars_score: number | null
  signal_stars_value: string | null
  signal_ci_score: number | null
  signal_ci_value: string | null
  signal_bus_factor_score: number | null
  signal_bus_factor_value: string | null
}

export type ResultEvent = Event<'result', ResultEventData>

/** Extract a signal by name, returning null placeholders if not found */
function extractSignal(
  signals: SignalResult[],
  name: string,
): { score: number | null; value: string | null } {
  const signal = signals.find(s => s.name === name)
  if (!signal) return { score: null, value: null }
  return { score: signal.score, value: String(signal.value) }
}

/** Build a result event from a ScoringResult */
export function buildResultEvent(
  result: ScoringResult,
  source: string,
): ResultEvent {
  const [, owner, repo] = result.project.split('/')
  const signals = result.signals

  const lastCommit = extractSignal(signals, 'lastCommit')
  const lastRelease = extractSignal(signals, 'lastRelease')
  const issueStaleness = extractSignal(signals, 'issueStaleness')
  const prResponsiveness = extractSignal(signals, 'prResponsiveness')
  const recentContributors = extractSignal(signals, 'recentContributors')
  const starsTrend = extractSignal(signals, 'starsTrend')
  const ciActivity = extractSignal(signals, 'ciActivity')
  const busFactor = extractSignal(signals, 'busFactor')

  return createEvent('result', {
    project: `${owner?.toLowerCase() ?? ''}/${repo?.toLowerCase() ?? ''}`,
    score: result.score,
    verdict: result.verdict,
    source,
    signal_last_commit_score: lastCommit.score,
    signal_last_commit_value: lastCommit.value,
    signal_last_release_score: lastRelease.score,
    signal_last_release_value: lastRelease.value,
    signal_issue_staleness_score: issueStaleness.score,
    signal_issue_staleness_value: issueStaleness.value,
    signal_pr_responsiveness_score: prResponsiveness.score,
    signal_pr_responsiveness_value: prResponsiveness.value,
    signal_recent_contributors_score: recentContributors.score,
    signal_recent_contributors_value: recentContributors.value,
    signal_stars_score: starsTrend.score,
    signal_stars_value: starsTrend.value,
    signal_ci_score: ciActivity.score,
    signal_ci_value: ciActivity.value,
    signal_bus_factor_score: busFactor.score,
    signal_bus_factor_value: busFactor.value,
  })
}
