// ---------------------------------------------------------------------------
// Shared methodology metadata — single source of truth for scoring docs,
// cache versioning, and agent-facing response semantics.
// ---------------------------------------------------------------------------

import type {
  CacheStatusName,
  MethodologySignalDefinition,
  MethodologySummary,
  SignalName,
  Verdict,
} from './types'

type ThresholdRow = Readonly<{
  label: string
  score: number
  maxDays?: number
  minValue?: number
  maxValue?: number
}>

export const LAST_COMMIT_THRESHOLDS: readonly ThresholdRow[] = [
  { label: 'Within 30 days', maxDays: 30, score: 100 },
  { label: 'Within 90 days', maxDays: 90, score: 75 },
  { label: 'Within 180 days', maxDays: 180, score: 50 },
  { label: 'Within 1 year', maxDays: 365, score: 25 },
  { label: 'Over 1 year ago', score: 0 },
]

export const LAST_RELEASE_THRESHOLDS: readonly ThresholdRow[] = [
  { label: 'Within 90 days', maxDays: 90, score: 100 },
  { label: 'Within 180 days', maxDays: 180, score: 75 },
  { label: 'Within 1 year', maxDays: 365, score: 50 },
  { label: 'Over 1 year ago', score: 0 },
]

export const RESPONSIVENESS_THRESHOLDS: readonly ThresholdRow[] = [
  { label: 'Under 7 days', maxDays: 7, score: 100 },
  { label: 'Under 30 days', maxDays: 30, score: 75 },
  { label: 'Under 90 days', maxDays: 90, score: 50 },
  { label: 'Over 90 days', score: 25 },
]

export const CONTRIBUTOR_THRESHOLDS: readonly ThresholdRow[] = [
  { label: '6 or more', minValue: 6, score: 100 },
  { label: '2 - 5', minValue: 2, maxValue: 5, score: 75 },
  { label: '1', minValue: 1, maxValue: 1, score: 50 },
  { label: '0', minValue: 0, maxValue: 0, score: 0 },
]

export const BUS_FACTOR_THRESHOLDS: readonly ThresholdRow[] = [
  { label: 'Under 50%', maxValue: 49, score: 100 },
  { label: '50% - 69%', minValue: 50, maxValue: 69, score: 75 },
  { label: '70% - 89%', minValue: 70, maxValue: 89, score: 50 },
  { label: '90% and above', minValue: 90, score: 25 },
]

export const STAR_THRESHOLDS: readonly ThresholdRow[] = [
  { label: '1,000+', minValue: 1000, score: 100 },
  { label: '100 - 999', minValue: 100, maxValue: 999, score: 75 },
  { label: '10 - 99', minValue: 10, maxValue: 99, score: 50 },
  { label: 'Under 10', maxValue: 9, score: 25 },
]

export const CI_ACTIVITY_FACTORS = [
  ['Workflows present', '30'],
  ['Last run within 7 days', '30'],
  ['30+ runs/month', '20'],
  ['90%+ success rate', '20'],
] as const

export const METHODOLOGY = {
  version: '2026-03-30-agent-ready-v1',
  scoreType: 'maintenance-health',
  description:
    'A maintenance-health score derived from observable GitHub activity and workflow signals. It is not a security, license, or compliance assessment.',
  url: 'https://isitalive.dev/methodology',
} as const satisfies MethodologySummary

export const VERDICT_DEFINITIONS: ReadonlyArray<{
  name: Verdict
  label: string
  minScore: number
  maxScore: number
}> = [
  { name: 'healthy', label: 'Healthy', minScore: 80, maxScore: 100 },
  { name: 'stable', label: 'Stable', minScore: 60, maxScore: 79 },
  { name: 'degraded', label: 'Degraded', minScore: 40, maxScore: 59 },
  { name: 'critical', label: 'Critical', minScore: 20, maxScore: 39 },
  { name: 'unmaintained', label: 'Unmaintained', minScore: 0, maxScore: 19 },
]

export const CACHE_STATUS_DEFINITIONS: ReadonlyArray<{
  name: CacheStatusName
  label: string
  description: string
}> = [
  {
    name: 'l1-hit',
    label: 'L1 cache hit',
    description: 'Served from the Worker Cache API in the current datacenter.',
  },
  {
    name: 'l2-hit',
    label: 'L2 cache hit',
    description: 'Served from Workers KV while still inside the fresh window.',
  },
  {
    name: 'l2-stale',
    label: 'L2 stale',
    description: 'Served from stale KV data while background revalidation runs.',
  },
  {
    name: 'l2-stale-degraded',
    label: 'L2 stale (degraded)',
    description: 'Upstream provider is unavailable; served from cached data past its normal stale window. The response includes degraded: true and is not re-cached.',
  },
  {
    name: 'l3-miss',
    label: 'Live fetch',
    description: 'Fetched live from the provider and freshly scored.',
  },
]

export const SIGNAL_DEFINITIONS: ReadonlyArray<MethodologySignalDefinition> = [
  {
    name: 'lastCommit',
    label: 'Last Commit',
    weight: 0.25,
    measurement: 'direct',
    description:
      'How recently the default branch received a commit. This is the strongest indicator that someone is actively working on the project.',
    source: 'defaultBranchRef.target.history(first: 1)',
    tableHeaders: ['Recency', 'Score'],
    tableRows: LAST_COMMIT_THRESHOLDS.map((row) => [row.label, String(row.score)]),
    notes: [
      'Stability override: Projects with no open issues, no open PRs, and 10+ closed issues score 100 even if the last commit was over a year ago.',
    ],
  },
  {
    name: 'lastRelease',
    label: 'Last Release',
    weight: 0.15,
    measurement: 'direct',
    description:
      'When the most recent release was published. Regular releases indicate a project that ships to users, not just commits to main.',
    source: 'releases(last: 1)',
    tableHeaders: ['Recency', 'Score'],
    tableRows: LAST_RELEASE_THRESHOLDS.map((row) => [row.label, String(row.score)]),
  },
  {
    name: 'prResponsiveness',
    label: 'PR Responsiveness',
    weight: 0.15,
    measurement: 'sampled-proxy',
    description:
      'Median age of the 20 most recently updated open pull requests. It is a sampled proxy for maintainer responsiveness, not a full-history measurement.',
    source: 'pullRequests(first: 20, states: OPEN, orderBy: UPDATED_AT)',
    tableHeaders: ['Median PR Age', 'Score'],
    tableRows: RESPONSIVENESS_THRESHOLDS.map((row) => [row.label, String(row.score)]),
    notes: [
      'Inbox zero: If there are no open PRs and the project has a history of closed issues, the score is 100. If there is no issue history at all, the score defaults to 75.',
    ],
  },
  {
    name: 'issueStaleness',
    label: 'Issue Staleness',
    weight: 0.10,
    measurement: 'sampled-proxy',
    description:
      'Median age of the last comment on the 50 most recently updated open issues. It is a sampled proxy for maintainer triage activity.',
    source: 'issues(first: 50, states: OPEN, orderBy: UPDATED_AT)',
    tableHeaders: ['Median Comment Age', 'Score'],
    tableRows: RESPONSIVENESS_THRESHOLDS.map((row) => [row.label, String(row.score)]),
    notes: [
      'Inbox zero: No open issues plus a history of closed issues scores 100. No issue history at all scores 75.',
    ],
  },
  {
    name: 'recentContributors',
    label: 'Recent Contributors',
    weight: 0.10,
    measurement: 'sampled-proxy',
    description:
      'Unique commit authors in the last 90 days, sampled from up to 100 recent commits on the default branch.',
    source: 'defaultBranchRef.target.history(first: 100, since: 90d ago)',
    tableHeaders: ['Contributors (90d)', 'Score'],
    tableRows: CONTRIBUTOR_THRESHOLDS.map((row) => [row.label, String(row.score)]),
  },
  {
    name: 'busFactor',
    label: 'Bus Factor',
    weight: 0.10,
    measurement: 'sampled-proxy',
    description:
      'Share of recent commits from the top contributor, derived from the same 90-day / 100-commit contributor sample.',
    source: 'Calculated from sampled commit author distribution',
    tableHeaders: ['Top Contributor %', 'Score'],
    tableRows: BUS_FACTOR_THRESHOLDS.map((row) => [row.label, String(row.score)]),
    notes: [
      'Solo-maintainer forgiveness: small projects under 1,000 stars with a dominant contributor score 85 instead of 25.',
    ],
  },
  {
    name: 'ciActivity',
    label: 'CI/CD Activity',
    weight: 0.10,
    measurement: 'sampled-proxy',
    description:
      'Checks whether CI workflows exist, how recently they ran, how often they ran in the last 30 days, and a sampled recent success rate.',
    source: 'object(expression: "HEAD:.github/workflows") + REST /actions/runs',
    tableHeaders: ['Factor', 'Max Points'],
    tableRows: CI_ACTIVITY_FACTORS.map((row) => [...row]),
  },
  {
    name: 'starsTrend',
    label: 'Stars',
    weight: 0.05,
    measurement: 'direct',
    description:
      'Absolute GitHub star count as a low-weight proxy for community interest. Popularity does not imply maintenance.',
    source: 'stargazerCount',
    tableHeaders: ['Stars', 'Score'],
    tableRows: STAR_THRESHOLDS.map((row) => [row.label, String(row.score)]),
  },
] as const

export const SIGNAL_DEFINITION_BY_NAME: Readonly<Record<SignalName, MethodologySignalDefinition>> =
  Object.freeze(
    Object.fromEntries(
      SIGNAL_DEFINITIONS.map((definition) => [definition.name, definition]),
    ) as Record<SignalName, MethodologySignalDefinition>,
  )

export function getSignalDefinition(name: SignalName): MethodologySignalDefinition {
  return SIGNAL_DEFINITION_BY_NAME[name]
}
