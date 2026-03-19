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

    # Recent open issues with last comment date
    issues(last: 50, states: OPEN, orderBy: { field: UPDATED_AT, direction: DESC }) {
      nodes {
        createdAt
        updatedAt
        comments(last: 1) {
          nodes { createdAt }
        }
      }
    }

    # Recent open PRs
    pullRequests(last: 20, states: OPEN, orderBy: { field: CREATED_AT, direction: DESC }) {
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

    return {
      archived: r.isArchived,
      name: r.name,
      owner: r.owner.login,
      description: r.description,
      stars: r.stargazerCount,
      forks: r.forkCount,
      defaultBranch: r.defaultBranchRef?.name ?? 'main',
      lastCommitDate,
      lastReleaseDate,
      issueStalenessMedianDays,
      prResponsivenessMedianDays,
      recentContributorCount,
      topContributorCommitShare,
      hasCi,
    };
  }
}
