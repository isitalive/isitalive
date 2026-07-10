# Is It Alive?

**One HTTP call tells you — and your AI coding agent — whether an open-source dependency is still maintained.**

[![Is It Alive?](https://isitalive.dev/api/badge/github/isitalive/isitalive)](https://isitalive.dev/github/isitalive/isitalive)
<!-- audited by isitalive/audit-action -->

```bash
curl -s https://isitalive.dev/api/check/package/npm/react | jq
# { "score": 96, "verdict": "healthy", "signals": [...], "drivers": [...] }
```

No signup. No API key for single checks. Works with npm packages, Go modules, and any public GitHub repository.

## Why

Security scanners tell you when a dependency is dangerous. Nobody tells you when it's dying.

- Roughly **1 in 5** of npm's most-downloaded packages is deprecated, archived, or has lost its repository ([Aqua Security](https://www.aquasec.com/blog/deceptive-deprecation-the-truth-about-npm-deprecated-packages/)).
- Around **61%** of npm packages haven't shipped a release in over a year ([Snyk](https://snyk.io/blog/how-much-do-we-really-know-about-how-packages-behave-on-the-npm-registry/)).
- AI coding agents now add dependencies faster than any human reviews them.

IsItAlive turns "is this project still maintained?" into a number you can automate: a 0–100 **maintenance-health score** built from eight observable GitHub signals — last commit, release cadence, PR responsiveness, issue triage, recent contributors, bus factor, CI activity, and community size. Every signal is returned in the response, so humans and agents can inspect the evidence instead of trusting a black box.

This is a maintenance-risk signal, **not** a security, license, or compliance verdict. Pair it with your security scanner — it covers the risk window before the CVE.

## Quick Start

```bash
# npm package
curl -s https://isitalive.dev/api/check/package/npm/react | jq

# Go module
curl -s https://isitalive.dev/api/check/package/go/golang.org/x/crypto | jq

# any GitHub repo
curl -s https://isitalive.dev/api/check/github/vercel/next.js | jq
```

| Verdict | Score | Meaning |
|---------|-------|---------|
| healthy | 80–100 | Strong observable maintenance activity |
| stable | 60–79 | Maintained but showing some age |
| degraded | 40–59 | Maintenance signals are weakening |
| critical | 20–39 | Significant maintenance concerns |
| unmaintained | 0–19 | Likely abandoned or archived |

The scoring methodology — weights, thresholds, sampling strategy, and known blind spots — is public: [isitalive.dev/methodology](https://isitalive.dev/methodology).

## Put it where dependencies enter your codebase

**AI agents.** The API is built to be called by Claude Code, Codex, Cursor, or any MCP-style tool: [llms.txt](https://isitalive.dev/llms.txt), [openapi.json](https://isitalive.dev/openapi.json), and [ai-plugin.json](https://isitalive.dev/.well-known/ai-plugin.json) are all published, responses include machine-readable `signals` and `drivers` rationale, and an optional `X-IsItAlive-Client: my-agent/0.3` header attributes traffic (it is not authentication and must not contain secrets).

```bash
curl -s https://isitalive.dev/api/check/package/npm/react \
  -H "X-IsItAlive-Client: my-agent/0.3 (https://example.com)" | jq
```

**CI.** Audit every dependency in a PR with the zero-config GitHub Action — public repos authenticate via OIDC, no key required:

```yaml
# .github/workflows/deps.yml
- uses: isitalive/audit-action@v1
  with:
    threshold: 40
```

**READMEs.** Show your project's own pulse:

```markdown
[![Is It Alive?](https://isitalive.dev/api/badge/github/YOUR_ORG/YOUR_REPO)](https://isitalive.dev/github/YOUR_ORG/YOUR_REPO)
```

## Manifest & batch audits (authenticated)

Score a whole `package.json`, lockfile, or `go.mod` in one request, or batch-check up to 200 mixed package/purl/repo inputs with policy thresholds:

```bash
# Manifest audit; if complete=false, wait retryAfterMs and repeat the same request
curl -s -X POST 'https://isitalive.dev/api/manifest?include=drivers,metrics,signals' \
  -H "Authorization: Bearer sk_your_api_key" \
  -H "Content-Type: application/json" \
  -d '{"format":"package.json","content":"<contents of package.json>"}' | jq

# Batch check with policy
curl -s -X POST https://isitalive.dev/api/check/batch \
  -H "Authorization: Bearer sk_your_api_key" \
  -H "Content-Type: application/json" \
  -d '{"items":[{"kind":"package","ecosystem":"npm","name":"react"}],"policy":{"failBelowScore":60}}' | jq
```

These endpoints require authentication. In GitHub Actions on public repos, OIDC handles it automatically. Standalone API keys are hand-issued while the service is in its free phase — email [hi@isitalive.dev](mailto:hi@isitalive.dev) or open an issue.

Supported formats: `package.json`, `package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`, `go.mod`, `go.sum`. Full API reference: [isitalive.dev/api](https://isitalive.dev/api).

## Honest limitations

- **Ecosystems**: npm and Go today (plus any public GitHub repo). Python and Rust are on the radar.
- **Signals are GitHub-based**: packages resolve to their linked GitHub repository. A package published from a monorepo inherits the monorepo's activity, and projects hosted elsewhere can't be scored yet.
- **The score is a heuristic**: thresholds are published, sampling is disclosed per signal, and archived repos hard-zero — but no single number replaces reading the `signals` and `drivers` for anything you're about to build on.
- **Rate limits are infrastructure protection**: 5 req/min anonymous, 50 req/min authenticated.

## Links

- **Website**: [isitalive.dev](https://isitalive.dev)
- **API Docs**: [isitalive.dev/api](https://isitalive.dev/api)
- **Methodology**: [isitalive.dev/methodology](https://isitalive.dev/methodology)
- **Audit Action**: [isitalive/audit-action](https://github.com/isitalive/audit-action)

## Development

```bash
npm install
echo "GITHUB_TOKEN=ghp_your_token_here" > .dev.vars
npm run dev
# Visit: http://localhost:8787/github/vercel/next.js
```

Runs on Cloudflare Workers (Hono, D1, KV, R2, Queues). See [AGENTS.md](AGENTS.md) for architecture, tests, and conventions.

## Operations

Production deploys run tests, type checks, generated Worker type checks, and a
remote D1 migration preflight before `wrangler deploy`. If Worker code depends
on a new D1 schema migration, apply it first:

```bash
CI=1 npx wrangler d1 migrations apply isitalive-db --remote
npm run deploy
```

## License

[AGPL-3.0](LICENSE) — free to use, free to self-host.
