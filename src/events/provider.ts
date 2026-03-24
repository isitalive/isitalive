// ---------------------------------------------------------------------------
// Provider Events — raw data fetched from upstream APIs
//
// "What GitHub told us" — the structured API response for a repo.
// One event per fresh fetch (not cached). Stored in Iceberg for
// historical raw data analysis and replay.
//
// v2: Flattened from raw_json string blob into typed columns for
//     efficient Parquet columnar compression (~98% storage reduction).
// ---------------------------------------------------------------------------

import type { Event } from './envelope'
import { createEvent } from './envelope'
import type { ProviderName, RawProjectData } from '../scoring/types'

/** Payload for a provider event — flattened from RawProjectData */
export interface ProviderEventData {
  provider: ProviderName
  owner: string
  repo: string
  archived: boolean
  description: string | null
  stars: number
  forks: number
  default_branch: string
  license: string | null
  homepage_url: string | null
  language: string | null
  language_color: string | null
  last_commit_date: string | null
  last_release_date: string | null
  issue_staleness_median_days: number | null
  pr_responsiveness_median_days: number | null
  open_issue_count: number
  closed_issue_count: number
  open_pr_count: number
  recent_contributor_count: number
  top_contributor_commit_share: number
  has_ci: boolean
  last_ci_run_date: string | null
  ci_run_success_rate: number | null
  ci_run_count: number
}

export type ProviderEvent = Event<'provider', ProviderEventData>

/** Build a provider event from a RawProjectData response */
export function buildProviderEvent(
  provider: ProviderName,
  owner: string,
  repo: string,
  data: RawProjectData,
): ProviderEvent {
  return createEvent('provider', {
    provider,
    owner: owner.toLowerCase(),
    repo: repo.toLowerCase(),
    archived: data.archived,
    description: data.description ?? null,
    stars: data.stars,
    forks: data.forks,
    default_branch: data.defaultBranch,
    license: data.license ?? null,
    homepage_url: data.homepageUrl ?? null,
    language: data.language ?? null,
    language_color: data.languageColor ?? null,
    last_commit_date: data.lastCommitDate ?? null,
    last_release_date: data.lastReleaseDate ?? null,
    issue_staleness_median_days: data.issueStalenessMedianDays ?? null,
    pr_responsiveness_median_days: data.prResponsivenessMedianDays ?? null,
    open_issue_count: data.openIssueCount,
    closed_issue_count: data.closedIssueCount,
    open_pr_count: data.openPrCount,
    recent_contributor_count: data.recentContributorCount,
    top_contributor_commit_share: data.topContributorCommitShare,
    has_ci: data.hasCi,
    last_ci_run_date: data.lastCiRunDate ?? null,
    ci_run_success_rate: data.ciRunSuccessRate ?? null,
    ci_run_count: data.ciRunCount,
  })
}
