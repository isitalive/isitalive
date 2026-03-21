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
- **Storage**: Cloudflare KV (cache), R2 (analytics), Queues (events)
- **GitHub integration**: Direct REST API calls — no Octokit dependency
- **Scoring**: 8 weighted signals from the GitHub GraphQL API
- **GitHub App**: Webhook handler that audits PR dependencies and posts results

## Key directories

```
src/
├── audit/       # manifest parsing, dependency resolution, scoring
├── cache/       # KV cache helpers (stale-while-revalidate)
├── github/      # GitHub App (auth, API client, handlers, report)
├── middleware/   # rate limiting
├── queue/       # Cloudflare Queue consumer (analytics, trending)
├── routes/      # Hono route handlers (check, badge, UI, audit)
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

## Audit (Manifest)

```
POST https://isitalive.dev/api/audit
Content-Type: application/json

{
  "content": "<raw package.json or go.mod content>",
  "format": "package.json"
}
```

Audits all dependencies in a manifest file and returns per-dependency health scores.

Supported formats: `package.json`, `go.mod`.

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

- **Anonymous**: 60 requests/minute
- **With API key**: higher limits (include `Authorization: Bearer sk_your_api_key`)

## Tips for Agents

1. **Cache results** — scores are cached for 6 hours; avoid redundant checks
2. **Use the audit endpoint** for batch checks of all dependencies at once
3. **Check the `verdict` field** for a quick human-readable assessment
4. **The `signals` array** gives granular detail if you need to explain the score
5. **Archived repos** are instantly scored 0 — no need to check signals
