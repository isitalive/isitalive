# IsItAlive

**Check whether an open-source dependency is still alive.**

[![Is It Alive?](https://isitalive.dev/api/badge/github/isitalive/isitalive)](https://isitalive.dev/github/isitalive/isitalive)
<!-- audited by isitalive/audit-action -->

IsItAlive scores open-source projects on 8 maintenance signals and gives you a single maintenance-health score (0–100). Use it to evaluate packages or GitHub repositories before humans or AI coding agents adopt them, or monitor the ones you already rely on.

This is a maintenance-risk signal, not a security, license, or compliance verdict.

## Quick Start

```bash
curl -s https://isitalive.dev/api/check/package/npm/react \
  -H "X-IsItAlive-Client: codex/1.0" | jq

curl -s https://isitalive.dev/api/check/github/vercel/next.js \
  -H "X-IsItAlive-Client: codex/1.0" | jq
```

## Agent Quick Start

Start from packages when you have dependency names, and use repo checks only when you already know the GitHub owner/repo. Add `X-IsItAlive-Client` for aggregate product analytics; it is not authentication and must not contain secrets.

```bash
# Package-first check
curl -s https://isitalive.dev/api/check/package/npm/react \
  -H "X-IsItAlive-Client: my-agent/0.3 (https://example.com)" | jq

# Manifest audit; if complete=false, wait retryAfterMs and repeat the same request
curl -s -X POST 'https://isitalive.dev/api/manifest?include=drivers,metrics,signals' \
  -H "Authorization: Bearer sk_your_api_key" \
  -H "X-IsItAlive-Client: my-agent/0.3 (https://example.com)" \
  -H "Content-Type: application/json" \
  -d '{"format":"package.json","content":"<contents of package.json>"}' | jq
```

## Links

- **Website**: [isitalive.dev](https://isitalive.dev)
- **API Docs**: [isitalive.dev/api](https://isitalive.dev/api)
- **Methodology**: [isitalive.dev/methodology](https://isitalive.dev/methodology)
- **Audit Action**: [isitalive/audit-action](https://github.com/isitalive/audit-action)

## License

[AGPL-3.0](LICENSE)
