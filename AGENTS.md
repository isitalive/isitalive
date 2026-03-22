# AGENTS.md

Instructions for AI agents and LLMs working on or using the IsItAlive project.

## Setup

```bash
npm install
echo "GITHUB_TOKEN=ghp_your_token_here" > .dev.vars
npm run dev
# Visit: http://localhost:8787/github/vercel/next.js
```

## Testing

```bash
npm test              # run all tests via vitest
npx vitest run        # same, explicit
npx tsc --noEmit      # type-check without emitting
```

- All tests must pass before committing.
- Add or update tests for any new logic you introduce.

## Code style

- TypeScript strict mode
- Single quotes, no trailing semicolons in most files
- Use `const` over `let`; avoid `var`
- Prefer `Object.hasOwn()` over the `in` operator
- All source code lives under `src/`
- UI templates are in `src/ui/` — they return raw HTML strings (no framework)

## Architecture

- **Runtime**: Cloudflare Workers + Hono router
- **Storage**: Cloudflare KV (cache), R2 (analytics), Pipelines (events → Iceberg)
- **GitHub integration**: Direct REST API calls — no Octokit dependency
- **Scoring**: 8 weighted signals from the GitHub GraphQL API
- **GitHub App**: Webhook handler that audits PR dependencies and posts results
- **GitHub Action**: [`isitalive/audit-action`](https://github.com/isitalive/audit-action) — composite action using OIDC for zero-config CI

## Key directories

```
src/
├── audit/       # manifest parsing, dependency resolution, scoring
├── cache/       # KV cache helpers (stale-while-revalidate)
├── cron/        # scheduled aggregation (trending, quota, sitemap)
├── github/      # GitHub App (auth, API client, handlers, report, OIDC)
├── middleware/   # auth (API key + OIDC), rate limiting
├── pipeline/    # event emission to Cloudflare Pipelines
├── routes/      # Hono route handlers (check, badge, UI, manifest)
├── scoring/     # health score engine and signal definitions
└── ui/          # HTML page templates (landing, result, changelog, etc.)
```

## PR and commit conventions

- Commit messages: `type(scope): description` (e.g., `feat(github): add PR comments`)
- Keep PRs focused — one feature or fix per PR
- Update `CHANGELOG.md` for user-facing changes

## Quick Check API

```
GET https://isitalive.dev/api/check/github/{owner}/{repo}
```

Returns a JSON object with the health score and verdict for any GitHub project.

### Example

```bash
curl -s https://isitalive.dev/api/check/github/vercel/next.js | jq
```

### Response

```json
{
  "score": 92,
  "verdict": "healthy",
  "project": "github/vercel/next.js",
  "signals": [
    { "label": "Last Commit", "score": 100, "weight": 0.25, "value": "2 days ago" },
    { "label": "Release Cadence", "score": 95, "weight": 0.15, "value": "3 days ago" }
  ]
}
```

## Verdicts

| Verdict | Score Range | Meaning |
|---------|------------|---------|
| healthy | 80–100 | Actively maintained, safe to depend on |
| stable | 60–79 | Maintained but showing some age |
| degraded | 40–59 | Slowing down, worth monitoring |
| critical | 20–39 | Significant maintenance concerns |
| unmaintained | 0–19 | Likely abandoned |

## Manifest Audit

```
POST https://isitalive.dev/api/manifest
Authorization: Bearer sk_your_api_key
Content-Type: application/json

{
  "content": "<raw package.json or go.mod content>",
  "format": "package.json"
}
```

Audits all dependencies in a manifest file and returns per-dependency health scores.
Requires authentication (API key or GitHub Actions OIDC token). The old `/api/audit` path redirects here.

Supported formats: `package.json`, `go.mod`.

### Authentication

Two authentication methods are supported:

1. **API key** (all repos): `Authorization: Bearer sk_your_api_key`
2. **GitHub Actions OIDC** (public repos only): `Authorization: Bearer <oidc_jwt>`

OIDC tokens are obtained automatically by the [`isitalive/audit-action`](https://github.com/isitalive/audit-action). Public repos get 500 deps scored/month free.

## Manifest Hash Lookup (CDN-cached)

```
GET https://isitalive.dev/api/manifest/hash/{sha256_hash}
```

Returns cached audit results by manifest content hash. No authentication required.
CDN-cached for 7 days (`s-maxage=604800`). Returns 404 if the manifest hasn't been audited yet.

Used by the GitHub Action for $0-cost cache hits — hash your manifest locally, try GET first, POST only on miss.

## Badge

```
GET https://isitalive.dev/api/badge/github/{owner}/{repo}
```

Returns an SVG badge you can embed in READMEs:

```markdown
[![Is It Alive?](https://isitalive.dev/api/badge/github/YOUR_ORG/YOUR_REPO)](https://isitalive.dev/github/YOUR_ORG/YOUR_REPO)
```

## OpenAPI

Full spec available at:

```
GET https://isitalive.dev/openapi.json
```

## AI Plugin Manifest

```
GET https://isitalive.dev/.well-known/ai-plugin.json
```

## Rate Limits

Rate limiting is purely infrastructure protection (not billing):

- **Anonymous**: 10 requests/minute (edge-cached, shouldn't hit Worker often)
- **With API key**: 1,000 requests/minute

## Tips for Agents

1. **Cache results** — scores are cached for 6 hours; avoid redundant checks
2. **Use the manifest endpoint** for batch checks of all dependencies at once (requires API key or OIDC)
3. **Use the hash endpoint first** — `GET /api/manifest/hash/{hash}` is free (CDN-cached); only POST on miss
4. **Check the `verdict` field** for a quick human-readable assessment
5. **The `signals` array** gives granular detail if you need to explain the score
6. **Archived repos** are instantly scored 0 — no need to check signals
7. **Anonymous check requests** are served from CDN edge cache (24h TTL) at zero Worker cost
8. **GitHub Actions** — use [`isitalive/audit-action`](https://github.com/isitalive/audit-action) for zero-config dependency auditing in CI
