# ADR-004: Quota Accounting & Cache Freshness Tiers

**Status**: Proposed
**Date**: 2026-03-21
**Authors**: @fforootd
**Related**: ADR-002 (billing model), ADR-003 (content-addressed caching)

## Context

ADR-002 established that rate limiting (infra protection) and billing (quotas) are separate concerns. ADR-003 introduced a 3-layer content-addressed cache for manifest audits. We need to define:

1. **What counts against quota** — which cache layer triggers billing
2. **Cache freshness by tier** — do paying customers get fresher data?
3. **The billable unit** — what exactly is a "health check"?

## Decision

### 1. The Billable Unit: "Dependency Scored"

A quota unit is consumed when the Worker **actually scores a dependency** — meaning it calls the GitHub API, computes signals, and writes the result. This only happens on a full cache miss (Layer 3).

| Operation | What happens | Quota consumed |
| --- | --- | --- |
| `GET /api/manifest/hash/:hash` → CDN hit | CDN serves cached JSON | **0** |
| `GET /api/manifest/hash/:hash` → KV hit | Worker reads KV, serves result | **0** |
| `POST /api/manifest` → KV hit | Worker reads KV, serves result | **0** |
| `POST /api/manifest` → full miss | Worker scores N deps via GitHub API | **N** (1 per dep) |
| `GET /api/check/:provider/:owner/:repo` → cache hit | KV/Cache API serves result | **0** |
| `GET /api/check/:provider/:owner/:repo` → full miss | Worker scores 1 repo | **1** |
| Website upload (Turnstile) | Worker scores N deps | **0** (PLG, free) |
| GitHub Action OIDC (public repo) | Same as POST flow above | Draws from OIDC quota |

> [!NOTE]
> "You only pay for new scores" is the value prop. Cache hits are free because no new compute was consumed. This aligns revenue with infrastructure cost and rewards the crowdsource effect — identical manifests across the community are scored once.

### 2. Cache Freshness by Tier

Health scores change over time — a dependency's activity evolves. Paying customers should get fresher data to justify the cost. Freshness is controlled by **KV cache TTL** (how long a scored result lives before it's considered stale and re-scored).

| Tier | KV TTL (`/api/check`) | KV TTL (`/api/manifest`) | CDN TTL (GET hash) | Rationale |
| --- | --- | --- | --- | --- |
| Anonymous | 24h | N/A (no POST access) | 7 days | Zero cost, data is directional |
| Authenticated (any key) | 1h | 1h | 7 days | Fresher data for identified users |

> [!NOTE]
> Additional freshness tiers (e.g., Pro = 15min) can be added later when paid plans exist. Starting with two tiers matches the rate limiting model (ADR-002).

> [!IMPORTANT]
> The **CDN GET cache** (`/api/manifest/hash/:hash`) always has a 7-day TTL regardless of tier — it's public, unauthenticated, and content-addressed. Authenticated users who want their tier's fresher data **POST** instead of using the GET cache, which checks KV with their 1h TTL.

#### How This Works in Practice

**Anonymous user** checks `lodash/lodash`:

- First check at 9am → scores, writes to KV with 24h TTL
- Checks again at 2pm → KV hit, returns cached result (0 quota)
- Checks again next day at 10am → KV expired, re-scores

**Authenticated user** checks `lodash/lodash`:

- First check at 9am → scores, writes to KV with 1h TTL
- Checks again at 9:30am → KV hit, returns cached result (0 quota)
- Checks again at 10:15am → KV expired, re-scores (1 quota unit)

The authenticated user gets data that's at most 1 hour old, but consumes more quota units over time. This is the intended trade-off — freshness costs compute.

### 3. Manifest Audit: Per-Dependency vs Per-Request

For `POST /api/manifest`, the quota unit is **per dependency scored**, not per request. A `package.json` with 50 dependencies that triggers a full score consumes 50 quota units.

However, individual dependency scores are cached independently (via `/api/check`). So within a manifest audit:

- If 40 of 50 deps already have fresh KV cache entries → only 10 deps scored → **10 quota units**
- If the exact same manifest was scored recently → KV hit on the whole result → **0 quota units**

This two-level caching (per-manifest hash + per-dependency) minimizes quota consumption naturally.

### 4. OIDC Quota (GitHub Action — Public Repos)

Public repos using GitHub Actions OIDC get a separate, fixed free quota:

| Scope | Quota | Reset |
| --- | --- | --- |
| Per public repository | 500 deps scored/month | Monthly |
| Per organization | 5,000 deps scored/month (aggregate) | Monthly |

Tracked via KV: `oidc:quota:{repository}` → `{ used: 142, period: "2026-03" }`

When quota is exceeded, the POST returns 429 with:

```json
{
  "error": "OIDC quota exceeded",
  "used": 500,
  "limit": 500,
  "hint": "Add an ISITALIVE_API_KEY secret for higher limits"
}
```

### 5. Quota Enforcement Mechanism

Consistent with ADR-002's approach — enforcement does not need to be real-time. The rate limiter protects infra; quota enforcement can lag by ~10 minutes.

```text
Layer 3 scoring happens
    │
    ▼
Usage event emitted to USAGE_PIPELINE (includes dep count)
    │
    ▼
Cron (every 10 min): aggregate per-key usage from Iceberg
    │
    ▼
KV: quota:{api_key} → { used: 4821, limit: 10000, period: "2026-03" }
    │
    ▼
On each authenticated POST: read KV counter
    → if used >= limit → 429 "Quota exceeded"
```

For OIDC, the same flow applies with `oidc:quota:{repository}` as the key.

> [!NOTE]
> The ~10 minute lag means a customer could slightly exceed their quota. This is acceptable — the rate limiter (1,000 req/min) prevents extreme overshoot, and the small overage acts as a natural grace period.

### 6. Interaction Between GET Cache and Freshness

A subtle scenario: a Pro customer who wants 1h-fresh data for a manifest that the 7-day GET cache already has.

**Resolution**: The Action/client should POST when freshness matters, not GET. The GET endpoint is optimized for cost ($0), not freshness. The Action can be configured per tier:

```yaml
- uses: isitalive/audit-action@v1
  with:
    # 'cache-first' = try GET, then POST (default, cheapest)
    # 'fresh' = always POST, skip GET (uses quota but gets tier-fresh data)
    strategy: cache-first
```

Most users should use `cache-first`. Only Pro/Enterprise customers with strict freshness requirements would use `fresh`.

## Consequences

### Positive

- **Fair billing** — only pay for actual compute, not cache hits
- **Clear value prop** — "you only pay for new scores"
- **Freshness incentive** — paying more gets fresher data, creating a natural upgrade path
- **Crowdsource benefit** — identical manifests scored once, all users benefit
- **Simple enforcement** — KV counters, ~10 min lag, rate limiter as safety net

### Negative

- **Per-dep counting complexity** — need to track individual dep scores within manifest audits
- **Freshness gap for GET cache** — 7-day CDN cache may serve stale results to GET users
- **Quota lag** — ~10 min window allows slight quota overshoot
- **OIDC quota tracking** — additional KV writes per public repo per month
