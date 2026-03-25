// ---------------------------------------------------------------------------
// Core types for the Is It Alive? health checker
// ---------------------------------------------------------------------------

/** Supported source-code hosting / registry providers */
export type ProviderName = 'github' | 'npm' | 'pypi' | 'crates' | 'kernel';

/** Human-readable health verdict — describes dependency risk, not just activity */
export type Verdict =
  | 'healthy'       // 80-100
  | 'stable'        // 60-79
  | 'degraded'      // 40-59
  | 'critical'      // 20-39
  | 'unmaintained'; // 0-19

/** Result of a single scoring signal */
export interface SignalResult {
  /** Machine-readable name */
  name: string;
  /** Human label */
  label: string;
  /** Raw value that was measured (display-friendly) */
  value: string | number | boolean;
  /** Score for this signal (0-100) */
  score: number;
  /** Weight applied to this signal (0-1, all weights sum to 1) */
  weight: number;
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
  /** Individual signal breakdowns */
  signals: SignalResult[];
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

  // PR responsiveness — median age in days of recent open PRs
  prResponsivenessMedianDays: number | null;

  // Issue & PR counts — for distinguishing "inbox zero" from "ghost town"
  openIssueCount: number;
  closedIssueCount: number;
  openPrCount: number;

  // Contributors — unique authors with commits in last 90 days
  recentContributorCount: number;

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
