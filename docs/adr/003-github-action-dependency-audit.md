# ADR-003: GitHub Action — Dependency Health Auditing in CI

**Status**: Proposed
**Date**: 2026-03-21
**Authors**: @fforootd
**Related**: ADR-002 (GitHub Action section, Phase 4)

## Context

IsItAlive provides a `POST /api/manifest` endpoint that accepts a `package.json` or `go.mod`, resolves all dependencies to GitHub repos, and scores each one. This endpoint already supports:

- **Content hashing** — SHA-256 of manifest content used as a cache key
- **ETag-based caching** — returns `ETag: "<hash>"`, responds with 304 when `If-None-Match` matches
- **Authentication** — requires `Authorization: Bearer sk_...` or GitHub Actions OIDC token

A GitHub Action that runs in CI can leverage this to provide cost-effective dependency health monitoring on every PR.

> [!IMPORTANT]
> **POST + ETag still wakes the Worker.** Cloudflare's CDN does not cache POST requests, so `POST /api/manifest` with `If-None-Match` always invokes the Worker (which returns 304 cheaply). To achieve true $0 CDN-edge responses, we need a `GET` endpoint keyed by content hash — because `GET` responses with `s-maxage` are edge-cached and served without any Worker invocation.

## Decision

### 1. Action Design — `isitalive/audit-action`

A **composite GitHub Action** (no Docker, no Node build step) that:

1. For each manifest file, hashes the content locally (SHA-256)
2. Tries `GET /api/manifest/hash/:hash` — served from CDN edge ($0 on hit)
3. On **200 OK** — cached result, no Worker invocation, no auth needed
4. On **404** — `POST /api/manifest` with content to trigger scoring (auth required)
5. Posts/updates a PR comment with health report
6. Exits with non-zero status if any dep scores below a configurable threshold

No `git diff` needed — the cache IS the change tracker. If the manifest hasn't changed, the hash is the same, and we get a CDN hit ($0). Users add the Action as a step in their existing CI workflow.

### 2. Content-Addressed CDN Caching (3-Layer)

CDNs don't cache POST requests. The Action hashes the manifest locally and tries a GET first. The hash is content-addressed — same manifest content always produces the same hash — making the cached result effectively **immutable** until the manifest changes.

```text
┌──────────────────────────────────────────────────────────┐
│  GitHub Actions Runner (user's CI minutes)                │
│                                                           │
│  1. For each manifest file:                               │
│     sha256sum package.json → abc123...                    │
│     GET /api/manifest/hash/abc123...  ← CDN-cacheable    │
│                                                           │
│  2. GET response:                                         │
│     200 → Results from CDN edge ($0, no Worker)           │
│     404 → Cache miss, proceed to step 3                   │
│                                                           │
│  3. POST /api/manifest (auth required)                    │
│     Authorization: Bearer oidc_<jwt> or sk_...            │
│     Body: { format, content }                             │
│                                                           │
│  4. POST response:                                        │
│     200 → New results (now cached for future GETs)        │
└──────────────────────────────────────────────────────────┘
```

#### Layer 1: CDN Edge (Cost: $0 | Latency: ~5ms)

`GET /api/manifest/hash/:hash` is a standard GET. Cloudflare's CDN caches the JSON response globally. Because the hash is content-addressed, the cache TTL can be long — **7 days** (`s-maxage=604800`). Identical manifests (e.g., thousands of `create-next-app` users) all get instant results from the nearest edge node.

> [!NOTE]
> A 7-day TTL is safe because the hash changes when the manifest content changes. The only scenario where stale data matters is if the scoring *algorithm* changes — and we can purge by cache tag when that happens.

#### Layer 2: KV Cache (Cost: micro-cents | Latency: ~20ms)

On CDN miss, the Worker checks `CACHE_KV` for `audit:result:<hash>`. If found, returns the result with `CDN-Cache-Control: public, s-maxage=604800` to repopulate the CDN edge for the next request.

#### Layer 3: Heavy Compute (Cost: API quota | Latency: 1000ms+)

On full miss, the client sends `POST /api/manifest` with the content. The Worker parses, resolves, scores, writes to KV. The next `GET /hash/:hash` for that content is a CDN hit.

> [!IMPORTANT]
> **Server-side change required**: Add `GET /api/manifest/hash/:hash` endpoint. This is ~20 lines of Hono code — reads from KV by hash, sets `CDN-Cache-Control: public, s-maxage=604800`, and returns the cached result (or 404). The existing `POST /api/manifest` already writes to the KV key (`audit:result:<hash>`) that this endpoint reads from.

### 3. Authentication — Dual Strategy

The Action supports two authentication modes:

#### Option A: GitHub Actions OIDC (Public Repos — Zero Config)

For **public repositories**, the Action requests a GitHub OIDC token at runtime. No secrets needed.

The OIDC token is a short-lived JWT issued by GitHub that proves:

- Which repository triggered the workflow (`repository`: `"vercel/next.js"`)
- Who owns it (`repository_owner`: `"vercel"`)
- Whether it's public (`repository_visibility`: `"public"`)
- Which workflow run created it (`run_id`, `sha`, `ref`)

The Worker validates the JWT against GitHub's OIDC issuer (`https://token.actions.githubusercontent.com`), extracts the claims, and grants a **fixed free quota per repository**:

| Claim | Use |
| --- | --- |
| `repository_visibility` | Must be `"public"` for free quota |
| `repository` | Rate limit key (e.g., `oidc:vercel/next.js`) |
| `repository_owner` | Aggregate quota tracking per org |
| `run_id` | Audit trail — links to the specific workflow run |

**Proposed free quota**: 500 health checks/month per public repo (enough for daily CI on active projects).

> [!NOTE]
> "Public" is a good-enough proxy for OSS. Source-available repos with restrictive licenses (BSL, SSPL) are still public on GitHub and would get the free quota. This is acceptable — the goal is community value, not license policing.

#### Option B: API Key (Private Repos or Higher Quotas)

For **private repositories** (or public repos needing more than the free OIDC quota), users provide an `ISITALIVE_API_KEY` secret:

- `POST /api/manifest` requires authentication (401 without either OIDC or API key)
- API key takes precedence if both are present
- Paid tiers get higher quotas (see ADR-002)

#### Auth Priority

```text
1. Authorization: Bearer sk_...    → API key lookup in KEYS_KV (existing flow)
2. Authorization: Bearer eyJ...    → JWT validation → check repository_visibility
3. No auth                         → 401
```

> [!NOTE]
> The `GET /api/manifest/hash/:hash` endpoint does **not** require authentication. It returns public health scores from the CDN cache. Authentication is only required on `POST` (which triggers the expensive scoring).

### 4. PR Comment Format

The Action posts a single PR comment (updated on re-runs, not duplicated):

```markdown
## 🔍 IsItAlive — Dependency Health Report

| Dependency | Score | Verdict | Details |
|-----------|-------|---------|---------|
| vercel/next.js | 92 | ✅ healthy | [view](https://isitalive.dev/github/vercel/next.js) |
| lodash/lodash | 45 | ⚠️ degraded | [view](https://isitalive.dev/github/lodash/lodash) |
| abandoned/pkg | 8 | 🔴 unmaintained | [view](https://isitalive.dev/github/abandoned/pkg) |

**Summary**: 12 dependencies checked, 10 healthy, 1 degraded, 1 unmaintained
Scanned `package.json` • [Powered by IsItAlive](https://isitalive.dev)
```

### 5. Configuration

**Public repo (zero config — OIDC):**

```yaml
permissions:
  id-token: write        # Required for OIDC token
  pull-requests: write   # Required for PR comments

- uses: isitalive/audit-action@v1
  with:
    # Optional: fail PR if any dep scores below this (default: 0 = never fail)
    fail-threshold: 20
    # Optional: which files to audit (default: auto-detect all package.json/go.mod)
    # Monorepo support (multiple paths) planned for a future version
    files: |
      package.json
      go.mod
```

**Private repo (API key):**

```yaml
permissions:
  pull-requests: write

- uses: isitalive/audit-action@v1
  with:
    api-key: ${{ secrets.ISITALIVE_API_KEY }}
    fail-threshold: 20
```

### 6. Dogfooding — Test on Our Own Repo

The `isitalive/isitalive` repository will be the first consumer:

1. Add the Action to `.github/workflows/audit.yml`
2. Configure it to run on `package.json` changes
3. Uses OIDC auth (public repo — zero secrets needed)
4. Validates the full flow: trigger → hash → GET (CDN) → POST (on miss) → PR comment

## Implementation

### Repository: `isitalive/audit-action`

```text
audit-action/
├── action.yml          # Composite action definition
├── scripts/
│   └── audit.sh        # Main script (bash, no build step)
├── README.md           # Usage docs + badge
├── LICENSE             # MIT
└── .github/
    └── workflows/
        └── test.yml    # Self-test workflow
```

**Composite action** (not JavaScript/Docker) because:

- Zero build step — works immediately
- Uses `curl` + `jq` — available on all GitHub runners
- Minimal maintenance surface
- Easy to read and audit

### Key Script Logic (`scripts/audit.sh`)

```bash
# 1. Find all manifest files
MANIFESTS=$(find . -name 'package.json' -o -name 'go.mod' \
  | grep -v node_modules)

# 2. For each manifest
for FILE in $MANIFESTS; do
  CONTENT=$(cat "$FILE")
  HASH=$(echo -n "$CONTENT" | sha256sum | cut -d' ' -f1)

  # 3. Try GET first (CDN-cached, $0 on hit)
  GET_RESPONSE=$(curl -s -w "\n%{http_code}" \
    "$API_URL/api/manifest/hash/$HASH")
  GET_STATUS=$(echo "$GET_RESPONSE" | tail -1)

  if [ "$GET_STATUS" = "200" ]; then
    echo "✅ $FILE — CDN hit (hash: ${HASH:0:12}...)"
    BODY=$(echo "$GET_RESPONSE" | sed '$d')
    # ... build PR comment from JSON
    continue
  fi

  # 4. Cache miss — POST with auth
  RESPONSE=$(curl -s -w "\n%{http_code}" \
    -X POST "$API_URL/api/manifest" \
    -H "Authorization: Bearer $AUTH_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"format\":\"$(basename $FILE)\",\"content\":$(jq -Rs . < "$FILE")}")

  STATUS=$(echo "$RESPONSE" | tail -1)
  BODY=$(echo "$RESPONSE" | sed '$d')
  # ... build PR comment from JSON
done
```

> [!IMPORTANT]
> The hashing must match the server's algorithm. The server uses `crypto.subtle.digest('SHA-256', ...)` on the raw content string. The bash equivalent is `echo -n "$CONTENT" | sha256sum`. The `-n` flag (no trailing newline) is critical.

### Server-Side: New GET Endpoint (~20 lines)

```typescript
// GET /api/manifest/hash/:hash — content-addressed CDN-cacheable lookup
app.get('/api/manifest/hash/:hash', async (c) => {
  const hash = c.req.param('hash')
  if (!/^[a-f0-9]{64}$/.test(hash)) {
    return c.json({ error: 'Invalid hash' }, 400)
  }

  const cached = await c.env.CACHE_KV.get(`audit:result:${hash}`)
  if (!cached) {
    return c.json({ error: 'Not found' }, 404)
  }

  // 7-day edge cache — hash is content-addressed, result is immutable
  c.header('CDN-Cache-Control', 'public, s-maxage=604800')
  c.header('Cache-Control', 'public, max-age=3600')
  return c.json(JSON.parse(cached))
})
```

## Consequences

### Positive

- **Zero config for public repos** — OIDC auth means no API key secret to manage
- **True $0 CDN hits** — GET-first pattern means cached manifests never wake the Worker
- **Long TTLs** — 7-day edge cache is safe because hashes are content-addressed
- **Crowdsource effect** — identical manifests (framework starters) scored once globally
- **Dogfooding** — we eat our own cooking, catching issues early
- **Composite action** — no build toolchain, minimal maintenance
- **PLG funnel** — public repos free, paid tiers for private repos + higher quotas

### Negative

- **Server-side OIDC validation required** — new middleware to verify GitHub OIDC JWTs
- **New GET endpoint** — small server-side addition (~20 lines)
- **Bash script** — harder to test than JS/TS, but composite actions are simpler to ship
- **Hash mismatch risk** — if server hashing changes, ETags break (mitigated by integration test)
- **PR comment permissions** — requires `id-token: write` and `pull-requests: write`
- **Quota enforcement for OIDC** — per-repo quota tracking adds KV writes
- **Scoring algorithm changes** — cached results may reflect old scores until manifest content changes (mitigated by cache tag purge)
