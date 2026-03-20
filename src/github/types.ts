// ---------------------------------------------------------------------------
// GitHub App — types
//
// Webhook payload types, configuration, and shared interfaces.
// Only the fields we actually use are typed — GitHub payloads are huge.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Webhook payloads (subset of fields we need)
// ---------------------------------------------------------------------------

export interface WebhookHeaders {
  'x-hub-signature-256': string | null;
  'x-github-event': string | null;
  'x-github-delivery': string | null;
}

export interface Repository {
  id: number;
  full_name: string;       // "vercel/next.js"
  name: string;            // "next.js"
  owner: { login: string };
  default_branch: string;
  private: boolean;
}

export interface PullRequest {
  number: number;
  head: { sha: string; ref: string };
  base: { sha: string; ref: string };
}

export interface Installation {
  id: number;
  account: { login: string; type: string };
}

/** pull_request.opened | pull_request.synchronize | pull_request.reopened */
export interface PullRequestEvent {
  action: string;
  number: number;
  pull_request: PullRequest;
  repository: Repository;
  installation: Installation;
}

/** push event (filtered to default branch in handler) */
export interface PushEvent {
  ref: string;              // "refs/heads/main"
  after: string;            // head commit SHA
  repository: Repository;
  installation: Installation;
}

/** installation.created */
export interface InstallationEvent {
  action: string;
  installation: Installation;
  repositories?: Array<{ id: number; full_name: string }>;
}

/** File entry from GitHub's "list pull request files" endpoint */
export interface PullRequestFile {
  sha: string;
  filename: string;
  status: string;           // "added" | "modified" | "removed" | "renamed"
  additions: number;
  deletions: number;
}

// ---------------------------------------------------------------------------
// GitHub App configuration
// ---------------------------------------------------------------------------

export interface GitHubAppConfig {
  /** Minimum average score to pass the check (0-100) */
  scoreThreshold: number;
  /** Maximum number of inline annotations to post */
  maxAnnotations: number;
}

export const DEFAULT_CONFIG: GitHubAppConfig = {
  scoreThreshold: 40,
  maxAnnotations: 50,
};

// ---------------------------------------------------------------------------
// Analytics event for the github-app
// ---------------------------------------------------------------------------

export interface GitHubAppAnalytics {
  installationId: number;
  action: 'audit' | 'rescan';
  trigger: 'pull_request' | 'push' | 'cron';
  repoFullName: string;
  prNumber?: number;
  manifestFormat: string;
  depCount: number;
  avgScore: number;
  conclusion: 'success' | 'failure';
  threshold: number;
  processingTimeMs: number;
}
