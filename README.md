# isitalive

[![Is It Alive?](https://isitalive.dev/api/badge/github/isitalive/isitalive)](https://isitalive.dev/github/isitalive/isitalive)

> Is this project safe to depend on?

Lightning-fast open-source dependency health checker. One query, one score, one answer.

Built with [Cloudflare Workers](https://workers.cloudflare.com/) + [Hono](https://hono.dev/).

## Quick Start

```bash
npm install
echo "GITHUB_TOKEN=ghp_your_token_here" > .dev.vars
npm run dev
# Visit: http://localhost:8787/zitadel/zitadel
```

## API

```bash
# Check any GitHub project
curl https://isitalive.dev/api/check/github/vercel/next.js | jq

# Get a badge for your README
# ![Is It Alive?](https://isitalive.dev/api/badge/github/vercel/next.js)
```

## Scoring

We check 8 signals and produce a weighted health score (0-100):

| Signal | Weight |
|---|---|
| Last commit | 25% |
| PR responsiveness | 15% |
| Release cadence | 15% |
| Issue staleness | 10% |
| Contributor diversity | 10% |
| Bus factor | 10% |
| CI/CD presence | 5% |
| Community size | 5% |

**Archived repos** are instantly scored 0 (Abandoned).

## GitHub App

Install the [IsItAlive GitHub App](https://github.com/apps/isitalive) to get automatic dependency audits on every pull request.

**What it does:**
- Audits your `package.json` / `go.mod` dependencies on every PR
- Posts a Check Run with pass/fail and inline annotations
- Posts (and updates) a PR comment with the audit summary
- Falls back to baseline audit when no manifest files are changed

## For AI Agents

See [AGENTS.md](./AGENTS.md) for instructions on using isitalive programmatically.

## License

[AGPL-3.0](./LICENSE)
