// ---------------------------------------------------------------------------
// Core types for the Is It Alive? health checker
// ---------------------------------------------------------------------------

/** Supported source-code hosting / registry providers */
export type ProviderName = 'github' | 'npm' | 'pypi' | 'crates' | 'kernel';

/** Stable machine-readable signal names */
export type SignalName =
  | 'lastCommit'
  | 'lastRelease'
  | 'issueStaleness'
  | 'prResponsiveness'
  | 'recentContributors'
  | 'starsTrend'
  | 'ciActivity'
  | 'busFactor'

/** Human-readable health verdict — describes dependency risk, not just activity */
export type Verdict =
  | 'healthy'       // 80-100
  | 'stable'        // 60-79
  | 'degraded'      // 40-59
  | 'critical'      // 20-39
  | 'unmaintained'; // 0-19

/** How a signal is measured */
export type SignalMeasurement = 'direct' | 'sampled-proxy'

/** Cache status labels shared across docs and responses */
export type CacheStatusName = 'l1-hit' | 'l2-hit' | 'l2-stale' | 'l3-miss'

/** Shared methodology summary */
export interface MethodologySummary {
  version: string
  scoreType: 'maintenance-health'
  description: string
  url: string
}

/** Canonical signal metadata used by docs and the scoring engine */
export interface MethodologySignalDefinition {
  name: SignalName
  label: string
  weight: number
  measurement: SignalMeasurement
  description: string
  source: string
  tableHeaders: [string, string]
  tableRows: ReadonlyArray<readonly [string, string]>
  notes?: string[]
}

/** Top reason the score is unusually strong or weak */
export interface ScoreDriver {
  signal: SignalName
  label: string
  direction: 'positive' | 'negative'
  weight: number
  score: number
  contribution: number
  summary: string
}

/** Machine-readable measurements that sit under the score */
export interface ProjectMetrics {
  archived: boolean
  defaultBranch: string
  stars: number
  forks: number
  openIssueCount: number
  closedIssueCount: number
  openPrCount: number
  lastCommitDate: string | null
  lastCommitAgeDays: number | null
  lastReleaseDate: string | null
  lastReleaseAgeDays: number | null
  issueStalenessMedianDays: number | null
  issueSampleSize: number
  issueSampleLimit: number
  issueSamplingStrategy: string
  prResponsivenessMedianDays: number | null
  prSampleSize: number
  prSampleLimit: number
  prSamplingStrategy: string
  recentContributorCount: number
  contributorCommitSampleSize: number
  contributorWindowDays: number
  topContributorCommitShare: number
  hasCi: boolean
  lastCiRunDate: string | null
  lastCiRunAgeDays: number | null
  ciRunSuccessRate: number | null
  ciRunCount: number
  ciWorkflowRunSampleSize: number
  ciSamplingWindowDays: number
  ciDataSource: 'actions-runs' | 'workflow-directory-only' | 'actions-runs-unavailable' | 'none'
}

/** Result of a single scoring signal */
export interface SignalResult {
  /** Machine-readable name */
  name: SignalName;
  /** Human label */
  label: string;
  /** Raw value that was measured (display-friendly) */
  value: string | number | boolean;
  /** Score for this signal (0-100) */
  score: number;
  /** Weight applied to this signal (0-1, all weights sum to 1) */
  weight: number;
  /** Whether this is a direct measurement or a sampled proxy */
  measurement: SignalMeasurement
  /** Underlying provider field or API used */
  source: string
}

/** Full scoring result returned by the engine */
export interface ScoringResult {
  /** e.g. "github/vercel/next.js" */
  project: string;
  /** Provider used */
  provider: ProviderName;
  /** Weighted total score 0-100 */
  score: number;
  /** Human verdict */
  verdict: Verdict;
  /** ISO-8601 timestamp */
  checkedAt: string;
  /** Whether this result came from cache */
  cached: boolean;
  /** Canonical explanation of what the score means */
  methodology: MethodologySummary
  /** Individual signal breakdowns */
  signals: SignalResult[];
  /** Top reasons the score is notably strong or weak */
  drivers: ScoreDriver[]
  /** Normalized raw measurements behind the score */
  metrics?: ProjectMetrics
  /** If archived, this explains the instant override */
  overrideReason?: string;
  /** Project metadata for display on result page */
  metadata?: ProjectMetadata;
}

/** Metadata for display on the result page (not used in scoring) */
export interface ProjectMetadata {
  description: string | null;
  license: string | null;
  homepageUrl: string | null;
  language: string | null;
  languageColor: string | null;
  stars: number;
  forks: number;
}

// ---------------------------------------------------------------------------
// Raw data that providers fetch (provider-agnostic shape)
// ---------------------------------------------------------------------------

export interface RawProjectData {
  // Repo-level metadata
  archived: boolean;
  name: string;
  owner: string;
  description: string | null;
  stars: number;
  forks: number;
  defaultBranch: string;

  // Metadata (not used in scoring, passed through to result page)
  license: string | null;
  homepageUrl: string | null;
  language: string | null;
  languageColor: string | null;

  // Temporal signals
  lastCommitDate: string | null;   // ISO-8601
  lastReleaseDate: string | null;  // ISO-8601

  // Issue staleness — median days since last comment on recent open issues
  issueStalenessMedianDays: number | null;
  issueSampleSize: number;
  issueSampleLimit: number;
  issueSamplingStrategy: string;

  // PR responsiveness — median age in days of recent open PRs
  prResponsivenessMedianDays: number | null;
  prSampleSize: number;
  prSampleLimit: number;
  prSamplingStrategy: string;

  // Issue & PR counts — for distinguishing "inbox zero" from "ghost town"
  openIssueCount: number;
  closedIssueCount: number;
  openPrCount: number;

  // Contributors — unique authors with commits in last 90 days
  recentContributorCount: number;
  contributorCommitSampleSize: number;
  contributorWindowDays: number;

  // Bus factor — % of recent commits from top contributor
  topContributorCommitShare: number; // 0-1

  // CI presence and activity
  hasCi: boolean;
  /** ISO-8601 date of the most recent workflow run (null if no runs) */
  lastCiRunDate: string | null;
  /** Success rate of recent workflow runs (0-1, null if no runs) */
  ciRunSuccessRate: number | null;
  /** Number of workflow runs in last 30 days */
  ciRunCount: number;
  /** Number of runs sampled for success-rate calculation */
  ciWorkflowRunSampleSize: number;
  /** Time window used for CI run count / recency checks */
  ciSamplingWindowDays: number;
  /** Whether CI metrics came from Actions or only workflow presence */
  ciDataSource: 'actions-runs' | 'workflow-directory-only' | 'actions-runs-unavailable' | 'none';

}

// ---------------------------------------------------------------------------
// Provider interface
// ---------------------------------------------------------------------------

export interface Provider {
  name: ProviderName;
  /** Fetch raw data for a project identifier */
  fetchProject(owner: string, repo: string, token?: string): Promise<RawProjectData>;
}

// ---------------------------------------------------------------------------
// Worker environment bindings — re-exported from types/env.ts
//
// Kept here for backward compatibility so existing imports don't break.
// New code should import directly from '../types/env'.
// ---------------------------------------------------------------------------

export type { Pipeline, Env, ApiKeyEntry } from '../types/env';
