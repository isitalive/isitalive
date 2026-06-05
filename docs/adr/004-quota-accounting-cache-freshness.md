# ADR-004: Quota Accounting & Cache Freshness Tiers

**Status**: Partially superseded by ADR-008
**Date**: 2026-03-21
**Authors**: @fforootd
**Related**: ADR-002 (billing model), ADR-003 (content-addressed caching), ADR-007 (GTM & billing)

> [!NOTE]
> ADR-008 supersedes the launch-time quota and freshness-tier decisions. During free-to-use access, cached and fresh scoring are tracked for analytics, not billing; all authenticated access uses the same 24h fresh / 48h stale cache policy.

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

> [!IMPORTANT]
> The scored-dep budget is positioned as an **invisible safety net**, not a marketing feature. The customer-facing product is "private repos monitored" with "unlimited CI audits." The dep budget exists to protect infrastructure from abuse — 95% of customers never see it. See ADR-007 § 3 for Fail-Open CI behavior when the budget is exhausted.

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

### 4. OIDC Quota (Superseded for Free Access)

ADR-008 removes monthly GitHub Actions OIDC quota enforcement. Public repositories using OIDC authenticate as free traffic and share the authenticated infrastructure limit:

| Scope | Limit | Reset |
| --- | --- | --- |
| Authenticated API key or GitHub Actions OIDC | 50 requests/min | Per minute |

Private repository OIDC remains rejected. Private CI should use an authenticated API key.

### 5. Quota Enforcement Mechanism (Superseded for Free Access)

During free-to-use access, quota counters are not used to reject requests. The rate limiter protects infrastructure in real time:

```text
Request arrives
    |
    v
Auth resolves anonymous, API key, or public OIDC identity
    |
    v
Rate limiter enforces 5/min anonymous or 50/min authenticated
    |
    v
Cache-first scoring records events for analytics and history
```

Scoring, usage, provider, manifest, first-seen, trending, and history data collection remains active. Those datasets are analytics inputs, not billing enforcement inputs, until a future ADR reintroduces quotas.

### 6. CI Behavior During Free Access

GitHub Actions audits for public repositories authenticate through OIDC and run under the 50 requests/min infrastructure limit. If the service returns a 429 because that limit is exceeded, the action can retry or warn according to its own policy, but the API response is no longer a monthly quota or paid-upgrade message.

### 7. Interaction Between Manifest Cache and Freshness

All runtime access uses the free access cache policy:

| Fresh | Stale | L1 |
| ---: | ---: | ---: |
| 24h | 48h | 24h |

Legacy `pro` or `enterprise` key records are accepted for compatibility, but request handling normalizes them to the runtime `free` tier.

## Consequences

### Positive

- **Simple free access** — users and CI can try authenticated manifest audits without pricing friction
- **Infrastructure protection remains explicit** — abuse control is handled by per-minute limits
- **Crowdsource benefit** — identical manifests scored once, all users benefit
- **Analytics preserved** — usage and score history still accumulate for future product decisions

### Negative

- **No billing enforcement** — unusually heavy but compliant users are limited only by rate limits and cache behavior
- **Less freshness differentiation** — all users receive the same 24h/48h cache policy
