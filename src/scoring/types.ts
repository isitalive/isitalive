// ---------------------------------------------------------------------------
// Core types for the Is It Alive? health checker
// ---------------------------------------------------------------------------

/** Supported source-code hosting / registry providers */
export type ProviderName = 'github' | 'npm' | 'pypi' | 'crates' | 'kernel';

/** Human-readable health verdict */
export type Verdict =
  | 'healthy'    // 80-100
  | 'maintained' // 60-79
  | 'declining'  // 40-59
  | 'at_risk'    // 20-39
  | 'abandoned'; // 0-19

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

  // Temporal signals
  lastCommitDate: string | null;   // ISO-8601
  lastReleaseDate: string | null;  // ISO-8601

  // Issue staleness — median days since last comment on recent open issues
  issueStalenessMedianDays: number | null;

  // PR responsiveness — median age in days of recent open PRs
  prResponsivenessMedianDays: number | null;

  // Contributors — unique authors with commits in last 90 days
  recentContributorCount: number;

  // Bus factor — % of recent commits from top contributor
  topContributorCommitShare: number; // 0-1

  // CI presence
  hasCi: boolean;
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
// Worker environment bindings
// ---------------------------------------------------------------------------

export interface Env {
  CACHE_KV: KVNamespace;
  KEYS_KV: KVNamespace;          // API key store — managed via CF dashboard
  RATE_LIMITER: DurableObjectNamespace; // Rate limiting via Durable Object
  GITHUB_TOKEN?: string;

  // Cloudflare Turnstile — set via CF dashboard secrets
  TURNSTILE_SITE_KEY?: string;   // public, embedded in HTML
  TURNSTILE_SECRET_KEY?: string; // private, used for server-side verification
}

/** Shape of an API key entry in KEYS_KV */
export interface ApiKeyEntry {
  tier: 'free' | 'pro' | 'enterprise';
  name: string;
  active: boolean;
  created?: string;
}
