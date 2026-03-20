// ---------------------------------------------------------------------------
// GitHub provider — fetches all signals via a single GraphQL query
// ---------------------------------------------------------------------------

import type { Provider, RawProjectData, ProviderName } from '../scoring/types';

const GITHUB_GRAPHQL = 'https://api.github.com/graphql';

/** The single GraphQL query that fetches every signal we need */
const PROJECT_QUERY = `
query($owner: String!, $repo: String!, $since: GitTimestamp!) {
  repository(owner: $owner, name: $repo) {
    name
    owner { login }
    description
    isArchived
    stargazerCount
    forkCount
    homepageUrl
    licenseInfo { spdxId name }
    primaryLanguage { name color }

    # Last commit on default branch
    defaultBranchRef {
      name
      target {
        ... on Commit {
          # Most recent commit
          history(first: 1) {
            nodes { committedDate }
          }
          # Recent commits for contributor analysis (last 90 days)
          recentHistory: history(first: 100, since: $since) {
            nodes {
              committedDate
              author { user { login } }
            }
          }
        }
      }
    }

    # Latest release
    releases(last: 1, orderBy: { field: CREATED_AT, direction: ASC }) {
      nodes { publishedAt tagName }
    }

    # 50 most recently updated open issues
    issues(first: 50, states: OPEN, orderBy: { field: UPDATED_AT, direction: DESC }) {
      totalCount
      nodes {
        createdAt
        updatedAt
        comments(last: 1) {
          nodes { createdAt }
        }
      }
    }

    # Closed issue count — distinguishes "inbox zero" from "ghost town"
    closedIssues: issues(states: CLOSED) {
      totalCount
    }

    # 20 newest open PRs
    pullRequests(first: 20, states: OPEN, orderBy: { field: CREATED_AT, direction: DESC }) {
      totalCount
      nodes { createdAt }
    }

    # CI check — look for .github/workflows directory
    ciCheck: object(expression: "HEAD:.github/workflows") {
      __typename
    }
  }
}
`;

/** Compute median of a sorted numeric array */
function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

/** Days between two dates */
function daysBetween(from: string, to: Date): number {
  return Math.max(0, Math.floor((to.getTime() - new Date(from).getTime()) / (1000 * 60 * 60 * 24)));
}

export class GitHubProvider implements Provider {
  name: ProviderName = 'github';

  async fetchProject(owner: string, repo: string, token?: string): Promise<RawProjectData> {
    if (!token) {
      throw new Error('GITHUB_TOKEN is required for the GitHub provider');
    }

    const now = new Date();
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

    const res = await fetch(GITHUB_GRAPHQL, {
      method: 'POST',
      headers: {
        'Authorization': `bearer ${token}`,
        'Content-Type': 'application/json',
        'User-Agent': 'isitalive/0.1',
      },
      body: JSON.stringify({
        query: PROJECT_QUERY,
        variables: {
          owner,
          repo,
          since: ninetyDaysAgo.toISOString(),
        },
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`GitHub API error ${res.status}: ${body}`);
    }

    const json = await res.json() as any;

    if (json.errors?.length) {
      const msg = json.errors.map((e: any) => e.message).join('; ');
      throw new Error(`GitHub GraphQL error: ${msg}`);
    }

    const r = json.data.repository;
    if (!r) {
      throw new Error(`Repository not found: ${owner}/${repo}`);
    }

    // ── Parse last commit ───────────────────────────────────────────
    const lastCommitDate =
      r.defaultBranchRef?.target?.history?.nodes?.[0]?.committedDate ?? null;

    // ── Parse last release ──────────────────────────────────────────
    const lastReleaseDate =
      r.releases?.nodes?.[0]?.publishedAt ?? null;

    // ── Issue staleness ─────────────────────────────────────────────
    const issueNodes = r.issues?.nodes ?? [];
    const issueStaleDays = issueNodes.map((issue: any) => {
      const lastCommentDate =
        issue.comments?.nodes?.[0]?.createdAt ?? issue.updatedAt ?? issue.createdAt;
      return daysBetween(lastCommentDate, now);
    });
    const issueStalenessMedianDays = median(issueStaleDays);

    // ── PR responsiveness ───────────────────────────────────────────
    const prNodes = r.pullRequests?.nodes ?? [];
    const prAgeDays = prNodes.map((pr: any) => daysBetween(pr.createdAt, now));
    const prResponsivenessMedianDays = median(prAgeDays);

    // ── Recent contributors & bus factor ────────────────────────────
    const recentCommits = r.defaultBranchRef?.target?.recentHistory?.nodes ?? [];
    const authorCounts = new Map<string, number>();
    for (const commit of recentCommits) {
      const login = commit.author?.user?.login ?? '__anonymous__';
      authorCounts.set(login, (authorCounts.get(login) ?? 0) + 1);
    }
    const recentContributorCount = authorCounts.size;
    const totalRecentCommits = recentCommits.length;
    let topContributorCommitShare = 0;
    if (totalRecentCommits > 0) {
      const maxCommits = Math.max(...authorCounts.values());
      topContributorCommitShare = maxCommits / totalRecentCommits;
    }

    // ── CI presence ─────────────────────────────────────────────────
    const hasCi = r.ciCheck?.__typename === 'Tree';

    // ── CI activity (REST API — Actions workflow runs) ──────────────
    let lastCiRunDate: string | null = null;
    let ciRunSuccessRate: number | null = null;
    let ciRunCount = 0;

    if (hasCi) {
      try {
        const runsRes = await fetch(
          `https://api.github.com/repos/${owner}/${repo}/actions/runs?per_page=30&status=completed`,
          {
            headers: {
              'Authorization': `bearer ${token}`,
              'Accept': 'application/vnd.github+json',
              'User-Agent': 'isitalive/0.1',
            },
          },
        );
        if (runsRes.ok) {
          const runsJson = await runsRes.json() as any;
          const runs: any[] = runsJson.workflow_runs ?? [];

          // Filter to last 30 days
          const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          const recentRuns = runs.filter(
            (run: any) => new Date(run.created_at) >= thirtyDaysAgo,
          );

          ciRunCount = recentRuns.length;

          if (runs.length > 0) {
            lastCiRunDate = runs[0].created_at ?? null;
          }

          if (recentRuns.length > 0) {
            const successful = recentRuns.filter(
              (run: any) => run.conclusion === 'success',
            ).length;
            ciRunSuccessRate = successful / recentRuns.length;
          }
        }
      } catch {
        // Non-critical — fall back to hasCi boolean
      }
    }

    return {
      archived: r.isArchived,
      name: r.name,
      owner: r.owner.login,
      description: r.description,
      stars: r.stargazerCount,
      forks: r.forkCount,
      defaultBranch: r.defaultBranchRef?.name ?? 'main',
      license: r.licenseInfo?.spdxId ?? r.licenseInfo?.name ?? null,
      homepageUrl: r.homepageUrl || null,
      language: r.primaryLanguage?.name ?? null,
      languageColor: r.primaryLanguage?.color ?? null,
      lastCommitDate,
      lastReleaseDate,
      issueStalenessMedianDays,
      prResponsivenessMedianDays,
      openIssueCount: r.issues?.totalCount ?? 0,
      closedIssueCount: r.closedIssues?.totalCount ?? 0,
      openPrCount: r.pullRequests?.totalCount ?? 0,
      recentContributorCount,
      topContributorCommitShare,
      hasCi,
      lastCiRunDate,
      ciRunSuccessRate,
      ciRunCount,
      _rawResponse: json.data,
    };
  }
}
