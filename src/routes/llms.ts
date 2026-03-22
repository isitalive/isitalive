// ---------------------------------------------------------------------------
// llms.txt — human + LLM readable API description
//
// Served at /llms.txt and /llms-full.txt
// See: https://llmstxt.org
// ---------------------------------------------------------------------------

export const llmsTxt = `# Is It Alive?

> Check if an open-source project is actively maintained.

## API

Base URL: https://isitalive.dev

### Check Project Health
\`GET /api/check/{provider}/{owner}/{repo}\`

Returns a health score (0-100), verdict, and signal breakdown.

**Example:**
\`\`\`
curl https://isitalive.dev/api/check/github/vercel/next.js
\`\`\`

**Response fields:**
- \`score\` (0-100): Weighted health score
- \`verdict\`: healthy | stable | degraded | critical | unmaintained
- \`signals[]\`: Individual metrics (last_commit, issue_staleness, pr_responsiveness, etc.)
- \`cache.nextRefreshSeconds\`: When to re-poll for fresh data

### Audit Dependency Manifest
\`POST /api/manifest\`

**Requires authentication** (API key). Upload a go.mod or package.json and get a scored health report for every dependency. Synchronous, idempotent, cache-first.

**Request body (JSON):**
- \`format\`: "go.mod" | "package.json"
- \`content\`: Raw manifest file content

**Example:**
\`\`\`
curl -X POST https://isitalive.dev/api/manifest \\
  -H "Authorization: Bearer sk_your_api_key" \\
  -H "Content-Type: application/json" \\
  -d '{"format":"go.mod","content":"<contents of go.mod>"}'
\`\`\`

**Response fields:**
- \`auditHash\`: SHA-256 of manifest content (usable as ETag)
- \`complete\`: true if all deps scored, false if more time needed
- \`retryAfterMs\`: If incomplete, wait this long then call again
- \`scored\` / \`total\` / \`pending\` / \`unresolved\`: Counts
- \`summary\`: Aggregate verdict counts and average score
- \`dependencies[]\`: Per-dep results with name, version, github, score, verdict, dev flag

**Retry logic:** If \`complete\` is false, call the same endpoint again after \`retryAfterMs\`. The cache fills progressively — each call is faster.

**Unresolved deps:** Dependencies that can't be mapped to GitHub get \`verdict: "unresolved"\` with a \`unresolvedReason\` field (e.g. "gitlab_not_supported_yet", "no_github_repo", "repo_not_found").

### Get SVG Badge
\`GET /api/badge/{provider}/{owner}/{repo}\`

Returns an SVG badge for README embedding.

**Markdown:**
\`\`\`
![Is It Alive?](https://isitalive.dev/api/badge/github/owner/repo)
\`\`\`

## Authentication

Optional for health checks and badges. **Required for manifest audit.** Add \`Authorization: Bearer <key>\` for higher rate limits and access to all endpoints.

Rate limiting is infrastructure protection (not billing). Usage quotas are tracked separately.

| Level | Rate Limit | Cache TTL |
|-------|-----------|-----------|
| No key | 10/min | 24h |
| With key | 1,000/min | Tier-based |

## Scoring Signals

| Signal | Weight | What it measures |
|--------|--------|-----------------|
| Last Commit | 25% | Recency of latest commit |
| Last Release | 15% | Recency of latest release |
| Issue Staleness | 10% | Median age of open issue last comments |
| PR Responsiveness | 15% | Median age of recent pull requests |
| Recent Contributors | 10% | Unique contributors in last 90 days |
| Stars | 5% | Community interest |
| CI/CD | 10% | Whether CI workflows exist |
| Bus Factor | 10% | Commit concentration (top contributor %) |

## Providers

Currently supported: \`github\`

## OpenAPI Spec

Machine-readable spec: https://isitalive.dev/openapi.json

## License

AGPL-3.0 — https://github.com/isitalive/isitalive
`;

// TODO: llms-full.txt should include expanded signal descriptions, scoring
// thresholds, and example responses. For now it mirrors llms.txt.
export const llmsFullTxt = llmsTxt;
