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
- \`verdict\`: healthy | maintained | inactive | dormant | unmaintained
- \`signals[]\`: Individual metrics (last_commit, issue_staleness, pr_responsiveness, etc.)
- \`cache.nextRefreshSeconds\`: When to re-poll for fresh data

### Get SVG Badge
\`GET /api/badge/{provider}/{owner}/{repo}\`

Returns an SVG badge for README embedding.

**Markdown:**
\`\`\`
![Is It Alive?](https://isitalive.dev/api/badge/github/owner/repo)
\`\`\`

## Authentication

Optional. Add \`Authorization: Bearer <key>\` for higher rate limits.

| Tier | Rate Limit | Cache TTL |
|------|-----------|-----------|
| No key | 10/hr | 24h |
| Free key | 100/hr | 24h |
| Pro key | 1,000/hr | 1h |
| Enterprise | 10,000/hr | 15min |

## Scoring Signals

| Signal | Weight | What it measures |
|--------|--------|-----------------|
| Last Commit | 25% | Recency of latest commit |
| Last Release | 15% | Recency of latest release |
| Issue Staleness | 10% | Median age of open issue last comments |
| PR Responsiveness | 15% | Median age of recent pull requests |
| Recent Contributors | 10% | Unique contributors in last 90 days |
| Stars | 5% | Community interest |
| CI/CD | 5% | Whether CI workflows exist |
| Bus Factor | 10% | Commit concentration (top contributor %) |

## Providers

Currently supported: \`github\`

## OpenAPI Spec

Machine-readable spec: https://isitalive.dev/openapi.json

## License

AGPL-3.0 — https://github.com/isitaltive/isitalive
`;

export const llmsFullTxt = llmsTxt;
