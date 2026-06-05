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
├── routes/      # Hono route handlers (check, resolve, badge, UI, manifest)
├── scoring/     # health score engine and signal definitions
├── cli/         # local agent CLI
└── ui/          # HTML page templates (landing, result, changelog, etc.)
```

## PR and commit conventions

- Use Conventional Commit style for both PR titles and commit messages: `type(scope): description`.
- PR titles should be semantic-release friendly because the squash/merge title may drive versioning and changelog output.
- Prefer standard types such as `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, or `ci`; include a concise scope when useful, for example `fix(ui): handle missing recent queries`.
- Keep PRs focused — one feature or fix per PR
- Update `CHANGELOG.md` for user-facing changes

## Quick Check API

```
GET https://isitalive.dev/api/check/github/{owner}/{repo}
```

Returns a JSON object with the maintenance-health score and verdict for any GitHub project.

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
  "methodology": {
    "version": "2026-03-30-agent-ready-v1",
    "scoreType": "maintenance-health"
  },
  "signals": [
    { "name": "lastCommit", "label": "Last Commit", "score": 100, "weight": 0.25, "value": "2 days ago" }
  ],
  "drivers": [
    { "signal": "lastCommit", "direction": "positive", "summary": "Default branch activity is recent." }
  ]
}
```

Use `?include=metrics` when an agent needs normalized raw measurements and sampling metadata in addition to the default score, signals, and drivers.

## Verdicts

| Verdict | Score Range | Meaning |
|---------|------------|---------|
| healthy | 80–100 | Strong observable maintenance activity |
| stable | 60–79 | Maintained but showing some age |
| degraded | 40–59 | Maintenance signals are weakening |
| critical | 20–39 | Significant maintenance concerns |
| unmaintained | 0–19 | Likely abandoned or archived |

## Package Resolve And Check

```
GET https://isitalive.dev/api/resolve/npm?name=react
GET https://isitalive.dev/api/check/package/go?name=github.com/zitadel/zitadel&include=metrics
```

Use package-first endpoints when an agent knows the package or module name but not the canonical GitHub repository. Supported ecosystems: `npm`, `go`.

Unresolved packages return `200` with `resolution.resolved: false` and `result: null`; malformed package names or unsupported ecosystems return `400`.

## Manifest Audit

```
POST https://isitalive.dev/api/manifest
Authorization: Bearer sk_your_api_key
Content-Type: application/json

{
  "content": "<raw package.json, lockfile, go.mod, or go.sum content>",
  "format": "package.json"
}
```

Audits all dependencies in a manifest file and returns per-dependency maintenance-health scores.
Requires authentication (API key or GitHub Actions OIDC token). The old `/api/audit` path redirects here.

Supported formats: `package.json`, `package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`, `go.mod`, `go.sum`.

Optional query params:

- `include=drivers`
- `include=metrics`
- `include=signals`

Combine them with commas for richer agent output, for example:

```bash
curl -X POST 'https://isitalive.dev/api/manifest?include=drivers,metrics' ...
```

### Authentication

Two authentication methods are supported:

1. **API key** (all repos): `Authorization: Bearer sk_your_api_key`
2. **GitHub Actions OIDC** (public repos only): `Authorization: Bearer <oidc_jwt>`

OIDC tokens are obtained automatically by the [`isitalive/audit-action`](https://github.com/isitalive/audit-action). Public repositories using OIDC share the same authenticated infrastructure limit as API keys. There is no monthly public OIDC dependency quota during the current free-to-use access model.

## CLI

```bash
ISITALIVE_API_KEY=sk_your_api_key npx isitalive scan . --json --include drivers,metrics,signals
```

The CLI auto-detects supported manifest and lock files, sends `X-Manifest-Hash`, retries partial audits using `retryAfterMs`, and prints JSON for agent workflows.

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

- **Anonymous**: 5 requests/minute
- **With API key or public GitHub Actions OIDC**: 50 requests/minute

## Tips for Agents

1. **Treat this as maintenance-health** — the score is useful for maintainer activity and project durability, not security posture
2. **Cache results** — public repo scores use the free cache policy: 24h fresh / 48h stale
3. **Use `GET /api/check/...` first** when you already know the GitHub repo — it returns `methodology`, `signals`, and `drivers` by default
4. **Use `GET /api/resolve/{ecosystem}` or `GET /api/check/package/{ecosystem}`** when you only know an npm package or Go module name
5. **Use `?include=metrics`** on check endpoints when you need normalized raw measurements and sampling metadata
6. **Use the manifest endpoint** for batch checks of all dependencies at once (requires API key or OIDC)
7. **Use `include=drivers,metrics,signals` on `/api/manifest`** when an agent needs richer per-dependency evidence without rescoring
8. **Check the `verdict` field** for a quick human-readable assessment
9. **The `signals` and `drivers` arrays** provide granular, machine-readable rationale
10. **Archived repos** are instantly scored 0 — no need to inspect signals
11. **GitHub Actions** — use [`isitalive/audit-action`](https://github.com/isitalive/audit-action) for zero-config dependency auditing in CI
