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

> Check whether an open-source dependency still looks maintained before a human or AI agent builds on it.

## API

Base URL: https://isitalive.dev

Optional client attribution header for aggregate product analytics:
\`X-IsItAlive-Client: <tool>/<version> (<url-or-contact>)\`

Examples: \`X-IsItAlive-Client: codex/1.0\`, \`X-IsItAlive-Client: my-agent/0.3 (https://example.com)\`. This header is not authentication and should not contain secrets.

## Free to use

IsItAlive is free to use for public maintenance-health checks. Infrastructure limits apply.

- Public GitHub repository maintenance-health checks
- JSON score, verdict, signals, and drivers via \`/api/check\`
- Package-first checks via \`/api/check/package\` and package-to-GitHub resolution via \`/api/resolve\`
- SVG README badges
- Manifest and lockfile audits for \`package.json\`, \`package-lock.json\`, \`pnpm-lock.yaml\`, \`yarn.lock\`, \`go.mod\`, \`go.sum\`, \`requirements.txt\`, and \`pyproject.toml\` with API key or public GitHub Actions OIDC
- OpenAPI, \`llms.txt\`, and AI plugin manifest for agents
- Methodology, trending, recent queries, and score history where data is available

## MCP Server

IsItAlive is also a native Model Context Protocol server at \`https://isitalive.dev/mcp\` (Streamable HTTP, stateless, JSON responses). Tools: \`check_package\`, \`check_repo\`, and \`audit_manifest\`.

\`\`\`
# Claude Code
claude mcp add --transport http isitalive https://isitalive.dev/mcp

# Generic MCP client config
{"mcpServers": {"isitalive": {"type": "http", "url": "https://isitalive.dev/mcp"}}}
\`\`\`

\`check_package\` and \`check_repo\` work anonymously. \`audit_manifest\` requires authentication — add \`"headers": {"Authorization": "Bearer sk_your_api_key"}\` to the server config.

## Agent Quick Start

Start with package-first checks when you have a dependency name:
\`\`\`
curl -s https://isitalive.dev/api/check/package/npm/react \\
  -H "X-IsItAlive-Client: codex/1.0" | jq
\`\`\`

Use repo-first checks only when you already know the GitHub repository:
\`\`\`
curl -s https://isitalive.dev/api/check/github/vercel/next.js \\
  -H "X-IsItAlive-Client: codex/1.0" | jq
\`\`\`

Use manifest audit for batches. If \`complete\` is false, wait \`retryAfterMs\` and repeat the same request; add \`include=metrics\` only when you need normalized raw measurements:
\`\`\`
curl -s -X POST 'https://isitalive.dev/api/manifest?include=drivers,metrics,signals' \\
  -H "Authorization: Bearer sk_your_api_key" \\
  -H "X-IsItAlive-Client: codex/1.0" \\
  -H "Content-Type: application/json" \\
  -d '{"format":"package.json","content":"<contents of package.json>"}' | jq
\`\`\`

### Check Package Health
\`GET /api/check/package/{ecosystem}/{packageName}\`

Resolves an npm package, Go module, or PyPI package to GitHub, then returns the normal maintenance-health response for that repository with package context attached. Supported ecosystems: \`npm\`, \`go\`, \`pypi\`.

**Examples:**
\`\`\`
curl https://isitalive.dev/api/check/package/npm/react
curl 'https://isitalive.dev/api/check/package/npm?name=@types/node'
curl https://isitalive.dev/api/check/package/go/golang.org/x/crypto
curl https://isitalive.dev/api/check/package/pypi/requests
\`\`\`

**Resolve only:**
\`\`\`
curl https://isitalive.dev/api/resolve/npm/react
\`\`\`

**Package response fields:**
- \`package\`: ecosystem, name, and optional version context
- \`github\`: resolved GitHub owner/repo
- \`resolvedFrom\`: direct | vanity | registry | cache

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

### Batch Check Dependencies
\`POST /api/check/batch\`

**Requires authentication.** Accepts up to 200 mixed inputs: npm/Go/PyPI package descriptors, package URLs (purls), or GitHub owner/repo objects. Returns the same maintenance-health result shape used by manifest audits, plus \`batchHash\` and \`results[]\`.

**Request body (JSON):**
- \`items[]\`: \`{kind:"package", ecosystem, name, version?}\`, \`{kind:"purl", purl}\`, or \`{kind:"github", owner, repo, version?}\`
- \`policy\`: optional policy with \`failBelowScore\`, \`warnBelowScore\`, \`ignoreDevDependencies\`, \`failOnUnresolved\`, \`requireResolutionConfidence\`, and \`warnIfNoReleaseDays\`
- \`maxAgeSeconds\`, \`preferFresh\`: optional best-effort freshness controls

**Example:**
\`\`\`
curl -X POST https://isitalive.dev/api/check/batch \\
  -H "Authorization: Bearer sk_your_api_key" \\
  -H "Content-Type: application/json" \\
  -d '{"items":[{"kind":"package","ecosystem":"npm","name":"react"},{"kind":"purl","purl":"pkg:golang/golang.org/x/crypto"}],"policy":{"failBelowScore":60,"failOnUnresolved":true}}'
\`\`\`

### Audit Dependency Manifest
\`POST /api/manifest\` or \`POST /api/check/manifest\`

**Requires authentication** (API key or GitHub Actions OIDC for public repositories). Upload a supported manifest or lockfile and get a scored maintenance-health report for every dependency. Synchronous, idempotent, cache-first.

**Optional query params:**
- \`include=drivers\`: include per-dependency top drivers
- \`include=metrics\`: include per-dependency normalized raw measurements
- \`include=signals\`: include per-dependency signal breakdowns

**Request body (JSON):**
- \`format\`: "package.json" | "package-lock.json" | "pnpm-lock.yaml" | "yarn.lock" | "go.mod" | "go.sum" | "requirements.txt" | "pyproject.toml"
- \`content\`: Raw manifest file content
- \`policy\`, \`maxAgeSeconds\`, \`preferFresh\`: optional policy/freshness controls

**Example:**
\`\`\`
curl -X POST https://isitalive.dev/api/manifest \\
  -H "Authorization: Bearer sk_your_api_key" \\
  -H "X-IsItAlive-Client: codex/1.0" \\
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
- \`dependencies[].identity\`: canonical purl, ecosystem, name, version, dependencyType, and sourceFormat
- \`dependencies[].resolution\`: provider, repo, source, and resolution confidence
- \`dependencies[].state\`: resolved | pending | unresolved | unsupported_ecosystem | private_repo | rate_limited | provider_error
- \`dependencies[].dataFreshness\`: checkedAt, cacheStatus, ageSeconds, freshUntil, staleUntil, and max-age satisfaction
- \`dependencies[].policy\` and \`policyVerdict\`: present when a policy is supplied
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

Optional for package checks, project checks, package resolution, and badges. **Required for manifest audit.** Add \`Authorization: Bearer <key>\` or a GitHub Actions OIDC token for authenticated free access.

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

// TODO: llms-full.txt should include expanded signal descriptions, scoring
// thresholds, and example responses. For now it mirrors llms.txt.
export const llmsFullTxt = llmsTxt;
