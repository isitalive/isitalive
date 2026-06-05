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

const supportedFormats = '`go.mod`, `go.sum`, `package.json`, `package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`'

export const llmsTxt = `# Is It Alive?

> Check whether an open-source dependency still looks maintained before a human or AI agent builds on it.

## API

Base URL: https://isitalive.dev

## Free to use

IsItAlive is free to use for public maintenance-health checks. Infrastructure limits apply.

- Public GitHub repository maintenance-health checks
- JSON score, verdict, signals, and drivers via \`/api/check\`
- SVG README badges
- Manifest and lockfile audits (${supportedFormats}) with API key or public GitHub Actions OIDC
- Package-first resolution and checks for npm packages and Go modules
- Local CLI: \`isitalive scan . --json --include drivers,metrics,signals\`
- OpenAPI, \`llms.txt\`, and AI plugin manifest for agents
- Methodology, trending, recent queries, and score history where data is available

### Check Project Health
\`GET /api/check/{provider}/{owner}/{repo}\`

Returns a maintenance-health score (0-100), verdict, methodology metadata, signal breakdown, and top score drivers for dependency decisions.

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

### Resolve Package
\`GET /api/resolve/{ecosystem}?name={packageOrModule}&version={optional}\`

Supported ecosystems: \`npm\`, \`go\`.

Use this when you know a package name but not the canonical GitHub repo. Unresolved packages return \`resolution.resolved: false\`.

### Check Package Health
\`GET /api/check/package/{ecosystem}?name={packageOrModule}&version={optional}\`

Resolves an npm package or Go module to GitHub, then returns a nested project health result. Unresolved packages return \`200\` with \`result: null\`.

### Audit Dependency Manifest
\`POST /api/manifest\`

**Requires authentication** (API key or GitHub Actions OIDC for public repositories). Upload a supported manifest or lockfile and get a scored maintenance-health report for every dependency. Synchronous, idempotent, cache-first.

**Optional query params:**
- \`include=drivers\`: include per-dependency top drivers
- \`include=metrics\`: include per-dependency normalized raw measurements
- \`include=signals\`: include per-dependency signal breakdowns

**Request body (JSON):**
- \`format\`: "go.mod" | "go.sum" | "package.json" | "package-lock.json" | "pnpm-lock.yaml" | "yarn.lock"
- \`content\`: Raw manifest file content

**Headers for agents:**
- \`X-Manifest-Hash\`: optional SHA-256 of content for cache fast path before body parsing
- \`If-None-Match\`: optional previous ETag to receive \`304\` when unchanged

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

Optional for project checks, package resolve/check, and badges. **Required for manifest audit.** Add \`Authorization: Bearer <key>\` or a GitHub Actions OIDC token for authenticated free access.

Rate limiting is infrastructure protection. Free access is limited by authentication state.

| Level | Rate Limit | Cache TTL |
|-------|-----------|-----------|
| No key | 5/min | 24h fresh / 48h stale |
| API key or GitHub OIDC | 50/min | 24h fresh / 48h stale |

## Scoring Signals

Methodology version: \`${METHODOLOGY.version}\`

The score is a **maintenance-health** signal only. It helps humans and AI agents judge maintainer activity and project durability before choosing dependencies. It is not a security, license, or compliance verdict.

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

export const llmsFullTxt = `${llmsTxt}

## Agent CLI

Use the local CLI when operating inside a repository:

\`\`\`
ISITALIVE_API_KEY=sk_your_api_key isitalive scan . --json --include drivers,metrics,signals
\`\`\`

The CLI auto-detects ${supportedFormats}, computes a SHA-256 manifest hash, sends \`X-Manifest-Hash\`, retries partial audit responses using \`retryAfterMs\`, and exits nonzero only for auth, request, or runtime failures. Dependency verdicts such as \`critical\`, \`unmaintained\`, or \`unresolved\` are data for the caller, not CLI process failures.

## Recommended Agent Flow

1. If you already know a GitHub repository, call \`/api/check/github/{owner}/{repo}\`.
2. If you only know a package name, call \`/api/check/package/{ecosystem}?name=...\` or call \`/api/resolve/{ecosystem}?name=...\` first when you need to show the resolution.
3. For a repo audit, prefer the CLI or \`POST /api/manifest?include=drivers,metrics,signals\`.
4. If \`complete\` is false, wait \`retryAfterMs\` and call the same manifest endpoint again with the same body and \`X-Manifest-Hash\`.
5. Explain results as maintenance-health evidence only. Do not claim security, license, compliance, or supply-chain safety from this score alone.

## Error Handling

- \`400\`: invalid input, unsupported ecosystem, unsupported format, invalid JSON, or invalid manifest.
- \`401\`: manifest audit without auth, invalid OIDC, or private-repo OIDC.
- \`413\`: manifest payload too large.
- \`429\`: respect \`Retry-After\`; authenticated requests use the 50/min infrastructure limit.
- \`502\`, \`503\`, \`504\`: upstream GitHub failure, rate limit, circuit open, or timeout. Existing repo checks may serve stale degraded cache when available.
`;
