// ---------------------------------------------------------------------------
// GitHub App — thin REST API client
//
// Direct fetch calls to the GitHub API. No Octokit dependency.
// All methods require an installation access token.
// ---------------------------------------------------------------------------

const GITHUB_API = 'https://api.github.com';
const USER_AGENT = 'isitalive-github-app/1.0';

interface GitHubRequestOptions {
  token: string;
  method?: string;
  body?: unknown;
}

async function ghFetch<T>(path: string, opts: GitHubRequestOptions): Promise<T> {
  const response = await fetch(`${GITHUB_API}${path}`, {
    method: opts.method ?? 'GET',
    headers: {
      Authorization: `token ${opts.token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': USER_AGENT,
      ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GitHub API ${opts.method ?? 'GET'} ${path} failed (${response.status}): ${text}`);
  }

  return response.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Pull Request files
// ---------------------------------------------------------------------------

import type { PullRequestFile } from './types';

export async function listPullRequestFiles(
  token: string,
  owner: string,
  repo: string,
  prNumber: number,
): Promise<PullRequestFile[]> {
  // Paginate — PRs with many files may need multiple pages
  const files: PullRequestFile[] = [];
  let page = 1;
  const perPage = 100;

  while (true) {
    const batch = await ghFetch<PullRequestFile[]>(
      `/repos/${owner}/${repo}/pulls/${prNumber}/files?per_page=${perPage}&page=${page}`,
      { token },
    );
    files.push(...batch);
    if (batch.length < perPage) break;
    page++;
  }

  return files;
}

// ---------------------------------------------------------------------------
// File content
// ---------------------------------------------------------------------------

interface GitHubFileContent {
  content: string;       // base64-encoded
  encoding: string;
  sha: string;
  size: number;
}

/**
 * Fetch the content of a file at a specific ref (branch/SHA).
 * Returns the decoded string content.
 */
export async function getFileContent(
  token: string,
  owner: string,
  repo: string,
  path: string,
  ref: string,
): Promise<string> {
  const data = await ghFetch<GitHubFileContent>(
    `/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}?ref=${ref}`,
    { token },
  );

  if (data.encoding !== 'base64') {
    throw new Error(`Unexpected encoding: ${data.encoding}`);
  }

  return atob(data.content.replace(/\n/g, ''));
}

// ---------------------------------------------------------------------------
// Check Runs
// ---------------------------------------------------------------------------

export interface CheckRunOutput {
  title: string;
  summary: string;
  text?: string;
  annotations?: CheckAnnotation[];
}

export interface CheckAnnotation {
  path: string;
  start_line: number;
  end_line: number;
  annotation_level: 'notice' | 'warning' | 'failure';
  message: string;
  title?: string;
}

export interface CreateCheckRunParams {
  owner: string;
  repo: string;
  name: string;
  headSha: string;
  status: 'queued' | 'in_progress' | 'completed';
  conclusion?: 'success' | 'failure' | 'neutral' | 'action_required';
  output?: CheckRunOutput;
  detailsUrl?: string;
}

interface CheckRunResponse {
  id: number;
  html_url: string;
}

export async function createCheckRun(
  token: string,
  params: CreateCheckRunParams,
): Promise<CheckRunResponse> {
  return ghFetch<CheckRunResponse>(
    `/repos/${params.owner}/${params.repo}/check-runs`,
    {
      token,
      method: 'POST',
      body: {
        name: params.name,
        head_sha: params.headSha,
        status: params.status,
        conclusion: params.conclusion,
        output: params.output,
        details_url: params.detailsUrl,
      },
    },
  );
}

export async function updateCheckRun(
  token: string,
  owner: string,
  repo: string,
  checkRunId: number,
  update: {
    status?: 'in_progress' | 'completed';
    conclusion?: 'success' | 'failure' | 'neutral';
    output?: CheckRunOutput;
  },
): Promise<void> {
  await ghFetch(
    `/repos/${owner}/${repo}/check-runs/${checkRunId}`,
    { token, method: 'PATCH', body: update },
  );
}

// ---------------------------------------------------------------------------
// Commit Status
// ---------------------------------------------------------------------------

export async function createCommitStatus(
  token: string,
  owner: string,
  repo: string,
  sha: string,
  status: {
    state: 'pending' | 'success' | 'failure' | 'error';
    targetUrl?: string;
    description?: string;
    context?: string;
  },
): Promise<void> {
  await ghFetch(
    `/repos/${owner}/${repo}/statuses/${sha}`,
    {
      token,
      method: 'POST',
      body: {
        state: status.state,
        target_url: status.targetUrl,
        description: status.description,
        context: status.context ?? 'isitalive',
      },
    },
  );
}

// ---------------------------------------------------------------------------
// Issue / PR Comments
// ---------------------------------------------------------------------------

interface IssueComment {
  id: number;
  body: string;
  user: { login: string; type: string } | null;
}

/**
 * List all comments on a PR (uses the issues endpoint).
 * Paginates automatically in case there are many comments.
 */
export async function listPRComments(
  token: string,
  owner: string,
  repo: string,
  prNumber: number,
): Promise<IssueComment[]> {
  const comments: IssueComment[] = [];
  let page = 1;
  const perPage = 100;

  while (true) {
    const batch = await ghFetch<IssueComment[]>(
      `/repos/${owner}/${repo}/issues/${prNumber}/comments?per_page=${perPage}&page=${page}`,
      { token },
    );
    comments.push(...batch);
    if (batch.length < perPage) break;
    page++;
  }

  return comments;
}

/**
 * Create a new comment on a PR.
 */
export async function createPRComment(
  token: string,
  owner: string,
  repo: string,
  prNumber: number,
  body: string,
): Promise<IssueComment> {
  return ghFetch<IssueComment>(
    `/repos/${owner}/${repo}/issues/${prNumber}/comments`,
    { token, method: 'POST', body: { body } },
  );
}

/**
 * Update an existing PR comment by its comment ID.
 */
export async function updatePRComment(
  token: string,
  owner: string,
  repo: string,
  commentId: number,
  body: string,
): Promise<void> {
  await ghFetch(
    `/repos/${owner}/${repo}/issues/comments/${commentId}`,
    { token, method: 'PATCH', body: { body } },
  );
}
