// ---------------------------------------------------------------------------
// llms.txt — human + LLM readable API description
//
// Served at /llms.txt and /llms-full.txt
// See: https://llmstxt.org
// ---------------------------------------------------------------------------

import { CACHE_STATUS_DEFINITIONS, METHODOLOGY, SIGNAL_DEFINITIONS } from '../scoring/methodology'

const signalTable = SIGNAL_DEFINITIONS
  .map((signal) => `| ${signal.name} | ${signal.weight * 100}% | ${signal.measurement} | ${signal.description} |`)
  .join('\n')

const cacheStatusTable = CACHE_STATUS_DEFINITIONS
  .map((status) => `| \`${status.name}\` | ${status.description} |`)
  .join('\n')

export const llmsTxt = `# Is It Alive?

> Check if an open-source project looks actively maintained.

## API

Base URL: https://isitalive.dev

### Check Project Health
\`GET /api/check/{provider}/{owner}/{repo}\`

Returns a maintenance-health score (0-100), verdict, methodology metadata, signal breakdown, and top score drivers.

**Example:**
\`\`\`
curl https://isitalive.dev/api/check/github/vercel/next.js
\`\`\`

**Optional query params:**
- \`include=metrics\`: include normalized raw measurements and sampling metadata

**Response fields:**
- \`score\` (0-100): Weighted maintenance-health score
- \`verdict\`: healthy | stable | degraded | critical | unmaintained
- \`methodology\`: score semantics + stable methodology version
- \`signals[]\`: Individual metrics (camelCase names such as \`lastCommit\`, \`issueStaleness\`, \`prResponsiveness\`)
- \`drivers[]\`: top reasons the score is notably strong or weak
- \`metrics\`: only present when \`include=metrics\`
- \`cache.nextRefreshSeconds\`: When to re-poll for fresh data

### Audit Dependency Manifest
\`POST /api/manifest\`

**Requires authentication** (API key). Upload a go.mod or package.json and get a scored health report for every dependency. Synchronous, idempotent, cache-first.

**Optional query params:**
- \`include=drivers\`: include per-dependency top drivers
- \`include=metrics\`: include per-dependency normalized raw measurements
- \`include=signals\`: include per-dependency signal breakdowns

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
- \`methodology\`: audit-wide methodology summary and version
- \`scored\` / \`total\` / \`pending\` / \`unresolved\`: Counts
- \`summary\`: Aggregate verdict counts and average score
- \`dependencies[]\`: Per-dep results with name, version, github, score, verdict, dev flag, resolvedFrom, checkedAt, methodology
- \`dependencies[].drivers\`, \`dependencies[].metrics\`, \`dependencies[].signals\`: present only when requested via \`include\`

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
| No key | 5/min | 24h fresh / 48h stale |
| With key | 1,000/min | Tier-based |

## Scoring Signals

Methodology version: \`${METHODOLOGY.version}\`

The score is a **maintenance-health** signal only. It is not a security, license, or compliance verdict.

| Signal | Weight | Measurement | What it measures |
|--------|--------|-------------|------------------|
${signalTable}

## Cache Status

| Status | Meaning |
|--------|---------|
${cacheStatusTable}

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
