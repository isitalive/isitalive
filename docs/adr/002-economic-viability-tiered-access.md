# ADR-002: Economic Viability — Tiered Access & Cost-Optimized Architecture

**Status**: Proposed  
**Date**: 2026-03-21  
**Authors**: @fforootd  
**Supersedes**: Partially updates ADR-001 (usage event collection strategy)

## Context

IsItAlive runs on Cloudflare Workers. Every HTTP request currently wakes a Worker (billed per invocation), performs auth + rate-limit lookups, and emits usage events to Pipelines. This is economically unsustainable at scale: a viral badge or AI agent can generate millions of requests/day, each costing Worker CPU time and Pipeline writes — even when the response is already cached.

We need an architecture where **free/anonymous traffic is served as cheaply as possible** (ideally zero Worker invocations) while **paid traffic gets fresher data, deeper scanning, and usage metering**.

## Decision

### 1. Two-Track Request Model

| | **Anonymous / Free** | **Authenticated (API key)** |
|---|---|---|
| **Edge cache** | 24h CDN TTL (`s-maxage=86400`) | Bypasses CDN (`private, no-store`), always hits Worker |
| **Worker invocation** | Only on cache miss (≤1/24h per repo per colo) | Every request |
| **Rate limiting** | IP-based, 60/min (applied only on cache miss) | Key-based, tier limits |
| **Usage events** | **Not collected** (save Pipeline writes + Worker cost) | Per-request, per-key metering via Pipelines |
| **Analytics source** | Phase 1: Cloudflare Cache Analytics (free). Phase 2: Log Explorer ETL | Pipeline → Iceberg |
| **Audit (manifest)** | Turnstile-gated (web) or 401 (API) | Per-key, metered per dep scored |

> [!IMPORTANT]
> When an anonymous request results in a cache miss and wakes a Worker, we still write to KV cache and emit result/provider events (those power data freshness). We skip only the **usage** event to save Pipeline writes on the hot path.

### 2. Edge Caching Strategy (Anonymous)

Cloudflare's CDN can serve cached responses **without waking the Worker** when the response carries `s-maxage`. This is different from the Cache API (L1), which still requires a Worker invocation to check.

**Anonymous requests** (`/api/check`, `/api/badge`):

- Response includes `CDN-Cache-Control: public, s-maxage=86400` (24h)
- CDN edge caches the JSON/HTML response per datacenter
- Subsequent anonymous requests to the same URL: **zero Worker invocations, zero cost**
- On cache miss (once per 24h per repo per colo): Worker runs, scores, caches, emits result/provider events

**Authenticated requests**:

- Response includes `CDN-Cache-Control: private, no-store`
- Every request reaches the Worker for metering and fresher data
- Full usage events emitted to USAGE_PIPELINE per request and key

**Static pages** (landing, methodology, terms, changelog, etc.):

- Already set `s-maxage=3600–86400` → continue as-is, no Worker cost on cache hits
- Web Analytics beacon already covers page views client-side

### 3. Analytics Strategy — Two Phases

#### Phase 1: Split Analytics (No Cost for Free Tier)

For **anonymous traffic** (CDN-cached, no Worker):

- **Cloudflare Cache Analytics** (free, built into dashboard): aggregate hit rates, bandwidth, top URLs, status codes
- **Cloudflare Web Analytics** (free, beacon-based): page views with country, referrer, device — already deployed
- No per-request analytics — accept this gap as the cost of zero infrastructure spend on free tier

For **authenticated traffic** (Worker runs):

- Full **Pipeline → Iceberg** usage events per request, per API key
- Powers per-key metering, billing, usage dashboards
- Trending and tracked repos still powered by Iceberg aggregation cron

#### Phase 2: Log Explorer ETL (When Revenue Justifies)

> [!NOTE]
> Cloudflare **Log Explorer** (Log Search) is available as a **paid add-on for any Application Services plan** — not Enterprise-only. Pricing: **$0.10/GB/month** for ingestion + storage. **Unlimited SQL queries** at no additional cost.

**Log Explorer** stores `http_requests` logs for all edge traffic, **including CDN-cached responses that never wake a Worker**. This captures exactly the analytics gap from Phase 1.

**ETL flow**:

```
Cloudflare Log Explorer (http_requests)
    │
    │  Scheduled Workflow (every 10 min)
    │  SQL API: /zones/{zone_id}/logs/explorer/query/sql
    │
    │  SELECT ClientRequestPath, CacheCacheStatus, ClientCountry,
    │         ClientRequestUserAgent, EdgeResponseStatus, EdgeStartTimestamp
    │  FROM http_requests
    │  WHERE ClientRequestHost = 'isitalive.dev'
    │    AND ClientRequestPath LIKE '/api/%'
    │    AND EdgeStartTimestamp >= '{last_run}'
    │
    ▼
Transform into UsageEvent shape
    │
    ▼
Emit to USAGE_PIPELINE → Iceberg usage_events table
    │
    ▼
Existing cron aggregation → trending, tracked, sitemap
```

**Cost estimate**:

- `http_requests` avg record: ~1–2 KB
- Per 1M requests/day: ~1–2 GB/day → **~$3–6/month** for Log Explorer storage
- Unlimited SQL queries on top
- Worker + Pipeline cost for ETL Workflow: negligible (runs every 10 min)

> [!WARNING]
> Log Explorer stores logs in **Cloudflare-managed R2** (not your bucket). You pay Cloudflare for Log Explorer storage AND your own R2 Iceberg storage after ETL. The ETL step is the bridge between the two.

### 4. Manifest Audit Tiering

The `/api/manifest` endpoint is expensive: it parses manifests, resolves N dependencies to GitHub repos, and scores each one. AI agents submitting full `package.json` or `go.mod` files can trigger hundreds of GitHub API calls per request.

| Channel | Access | Protection | Metering |
|---|---|---|---|
| **Website upload** (PLG) | Free, anyone | Turnstile captcha | No metering (human-gated) |
| **API without auth** | **Blocked (401)** | — | — |
| **API with auth** | Allowed, metered | Per-key rate limit | Billed per dep scored |
| **GitHub App** | Paid customers only | Installation-gated | Per-manifest event |

> [!IMPORTANT]
> Unauthenticated POST to `/api/manifest` returns 401 with a message directing users to get an API key or use the website. This prevents AI agents from using the expensive audit endpoint for free.

### 5. GitHub App — Paid Only

The GitHub App triggers expensive operations on every PR (fetch manifest → parse → resolve → score → post check run + PR comment). These can't be edge-cached.

**Decision**: GitHub App installations are restricted to paid customers. The installation webhook handler validates that the `installation.id` maps to a paid API key in `KEYS_KV`. Free installations receive a friendly "upgrade required" check run.

### 6. GitHub Action — Client-Side Hashing (New)

For cost-effective CI/CD integration, we provide a **GitHub Action** that:

1. Triggers on changes to `package.json`, `go.mod`, `package-lock.json`, `go.sum`, etc.
2. **Hashes the manifest content client-side** (SHA-256) — no Worker invocation
3. Sends the hash as an `If-None-Match` ETag to `POST /api/manifest`
4. If **304 Not Modified** → deps haven't changed, skip (zero cost)
5. If **miss** → submits the manifest content, gets scored, caches result
6. Enforces a **per-repository daily limit** (e.g., 5 audits/day) via the action config

This shifts compute to the CI runner (free for the user's GitHub Actions minutes) and only hits our API when manifests actually change.

### 7. Lock File Parsing — Paid Feature

Parsing lock files (`package-lock.json`, `yarn.lock`, `go.sum`, `pnpm-lock.yaml`) provides deeper scanning (transitive dependencies) but is significantly more expensive:

- Lock files are 10–100× larger than manifests
- They contain hundreds to thousands of transitive deps
- Each dep requires resolution + scoring

**Decision**: Lock file parsing is a paid-only feature, available on Pro+ tiers. Pricing model (to be finalized):

| Tier | Repos/hour | Price | Benefit |
|---|---|---|---|
| Free | 0 (manifests only via web) | $0 | Direct deps only, Turnstile-gated |
| Pro | Up to 100 repos/hour | $5/mo (or pay-as-you-go) | Lock file parsing, fresher cache (1h) |
| Enterprise | Up to 1000 repos/hour | Custom | Lock files, 15min freshness, SLA |

> [!WARNING]
> Exact pricing requires cost modeling: GitHub API rate limits, Pipeline write costs, KV read costs per scored dep, and R2 SQL query costs for aggregation. This ADR establishes the architecture; pricing is a separate business decision.

### 8. PLG Motion — Website Upload

The landing page gains a **file upload** feature alongside the existing URL input:

- Users can drag-and-drop or browse for `package.json` / `go.mod`
- Protected by **Turnstile** (existing integration) — prevents automated abuse
- Alternatively, users paste a raw GitHub URL to a manifest and we fetch it
- Results are displayed inline (same page) with a shareable link
- No API key required — this is the free conversion funnel

### 9. Rate Limiting vs. Billing — Two Separate Concerns

Rate limiting and billing serve different purposes and must not be conflated.

#### Infrastructure Rate Limiting (Service Protection)

Rate limits protect the Worker from burst traffic. They are enforced **per-request in real time** by Cloudflare's native rate limiting binding. Every tier has them — including paid.

| Tier | Limit | Key | Purpose |
| --- | --- | --- | --- |
| Anonymous (no key) | 60 req/min | IP | Prevent abuse from bots/scripts |
| Free (API key) | 60 req/min | API key | Same as anonymous, identified |
| Pro | 300 req/min | API key | Higher burst for integrations |
| Enterprise | 1,000 req/min | API key | CI/CD pipelines at scale |

These are not billing mechanisms — they prevent a single client from starving others, regardless of how much they've paid.

These limits are **target policy values** for the steady-state system design. The current implementation in `src/middleware/rateLimit.ts` may enforce lower per-minute caps (at time of writing: Pro = 120 req/min, Enterprise = 600 req/min) until we validate and safely raise them.

#### Quota-Based Prepaid Billing (Revenue)

Billing is based on **health checks consumed per billing period** (monthly). A health check is the billable unit:

| Operation | Health checks consumed |
| --- | --- |
| `GET /api/check/github/{owner}/{repo}` | **1** per unique repo per cache miss |
| `POST /api/manifest` (manifest) | **N** (1 per dependency resolved and scored) |
| `POST /api/manifest` (lock file, Pro+) | **N** (1 per transitive dep resolved) |
| GitHub App (PR check) | **N** (1 per dep in manifest) |
| Website upload (Turnstile) | **0** (free, PLG funnel) |
| CDN cache hit (anonymous) | **0** (no Worker invocation) |

> [!NOTE]
> "Health check" maps directly to our cost structure: each scored dependency = GitHub API calls + compute + Pipeline write. Charging per health check aligns revenue with infrastructure cost.

#### Why Prepaid Quotas (Not Pay-as-you-go)

**Decision**: Prepaid quota tiers rather than metered pay-as-you-go.

| | Prepaid Quotas | Pay-as-you-go |
| --- | --- | --- |
| **Billing infra** | Plan tiers only (Stripe subscriptions) | Metered billing (Stripe usage records) |
| **Revenue predictability** | Fixed monthly per customer | Variable, unpredictable |
| **Collection risk** | $0 — paid upfront | Usage consumed before payment |
| **Customer UX** | No surprise bills, clear limits | Potential bill shock |
| **Implementation** | KV counter + cron, ~10 lines of code | Real-time metering, billing webhooks |
| **Overage handling** | Soft block at quota + grace window | Hard charges or hard cutoff |

PAYG can be added later as an Enterprise option ("custom usage, custom pricing") once billing infrastructure matures.

#### Enforcement Mechanism

Usage enforcement does **not** need to be real-time — the rate limiter already protects infra. A ~10 minute delay is acceptable:

```
Iceberg usage_events table
    │
    │  Cron (every 10 min)
    │  SELECT api_key, COUNT(*) AS checks_used
    │  FROM usage_events
    │  WHERE period = current_billing_period
    │  GROUP BY api_key
    │
    ▼
KV: usage:{api_key} → { used: 4821, limit: 10000, period: "2026-03" }
    │
    │  On each authenticated request (middleware):
    │  Read KV counter → if used >= limit → 429 "Quota exceeded"
    │
    ▼
Alert thresholds: 80%, 90%, 100% → email/webhook notification
```

> [!IMPORTANT]
> The ~10 minute staleness means a customer can slightly exceed their quota (at most 10 min of requests beyond the limit). This is acceptable and acts as a natural grace period. The rate limiter prevents extreme overshoot.

#### Proposed Tier Table

| Tier | Health checks/month | Rate limit | Cache freshness | Lock files | Price |
| --- | --- | --- | --- | --- | --- |
| Free (web only) | Unlimited (Turnstile-gated) | N/A | 24h | No | $0 |
| Free (API key) | 1,000 | 60/min | 24h | No | $0 |
| Pro | 10,000 | 300/min | 1h | Yes | TBD |
| Enterprise | 100,000+ | 1,000/min | 15min | Yes | Custom |

> [!WARNING]
> Exact check quotas and pricing require cost modeling. The numbers above are directional — actual limits depend on GitHub API rate limits per installation, Pipeline write costs, and KV read costs per scored dep.

## Architecture Diagram

```
                     ┌──────────────────────────────────────────┐
                     │              Cloudflare CDN              │
                     │  (s-maxage=86400 for anonymous requests) │
                     └────────────┬─────────────────────────────┘
                                  │
                    Cache HIT?────┤
                   /              │
                  YES             NO (or authenticated)
                  │               │
          ┌───────▼──────┐  ┌─────▼──────────────────────┐
          │  Serve from  │  │     Cloudflare Worker       │
          │  CDN edge    │  │                             │
          │  $0 cost     │  │  Auth → Rate Limit → Route  │
          │  No analytics│  │                             │
          └──────────────┘  │  if auth: emit usage event  │
                            │  if anon miss: skip usage   │
                            └──────────┬──────────────────┘
                                       │
                              ┌────────▼───────────┐
                              │  Phase 2 (later):  │
                              │  Log Explorer ETL  │
                              │  → backfill anon   │
                              │    analytics into  │
                              │    Iceberg          │
                              └────────────────────┘
```

## Changes to ADR-001

| ADR-001 Section | Change |
|---|---|
| **Usage events** | No longer emitted for anonymous/free requests. Only authenticated requests generate usage events to Pipelines. |
| **KV as materialized view** | Unchanged — cron aggregation still powers trending/tracked from Iceberg. |
| **Pipelines** | Usage pipeline traffic drops significantly (only auth'd requests). Provider + result pipelines unchanged. |

## Consequences

### Positive

- **Near-zero cost for free tier**: Anonymous traffic served from CDN edge at zero Worker cost
- **Sustainable at scale**: Viral badges/AI bots don't trigger Worker invocations or Pipeline writes
- **Clear monetization path**: Paid tiers get fresher data, deeper scanning, CI/CD integration, full analytics
- **GitHub Action is cost-effective**: Client-side hashing means most CI runs are free (304)
- **PLG funnel preserved**: Free website usage with Turnstile, no API key needed
- **Analytics upgrade path**: Log Explorer ETL can be added when revenue justifies cost

### Negative

- **No granular analytics for anonymous traffic in Phase 1**: Mitigated by Cache Analytics (aggregate) and Phase 2 Log Explorer ETL
- **24h stale window for free tier**: Free users see data up to 24h old (acceptable for health scores)
- **GitHub App revenue dependency**: Restricting to paid-only may slow adoption (mitigated by free GitHub Action alternative)
- **Lock file parser complexity**: Supporting 4+ lock file formats is significant engineering effort
- **Phase 2 double-storage**: Log Explorer storage + own R2 Iceberg storage for ETL'd data

## Implementation Phases

### Phase 1: Edge Cache + Paid Analytics (Implement Now)

1. Add `CDN-Cache-Control: public, s-maxage=86400` to unauthenticated `/api/check` and `/api/badge` responses
2. Add `CDN-Cache-Control: private, no-store` to authenticated API responses
3. Skip usage event emission for unauthenticated requests (keep result/provider events on cache miss)
4. Gate `POST /api/manifest` behind authentication (401 without API key, except web upload via Turnstile)
5. Rely on free Cloudflare Cache Analytics for aggregate anonymous traffic insights

### Phase 2: Log Explorer ETL (When Revenue ≥ $1000/month)

1. Enable Log Explorer for `http_requests` dataset on isitalive.dev zone
2. Build a scheduled Workflow (`LogExplorerETLWorkflow`) that queries the Log Explorer SQL API
3. Transform HTTP request logs into `UsageEvent` shape, emit to `USAGE_PIPELINE`
4. Full anonymous analytics now flow into existing Iceberg → cron → KV pipeline

### Phase 3: Metered Usage for Paid Tiers

1. Aggregate per-key usage from Iceberg `usage_events` via cron (deps scored, repos checked) — materialize into KV as read-optimized views (consistent with ADR-001 CQRS pattern)
2. Expose usage dashboard in admin routes, reading from KV materialized views
3. Implement audit-specific rate limits (per dep scored, not per request)

### Phase 4: GitHub Action

1. Build and publish `isitalive/audit-action` to GitHub Marketplace
2. Client-side manifest hashing + ETag-based caching
3. Per-repo daily audit limits

### Phase 5: PLG + Lock File Parsing

1. Website file upload with Turnstile
2. Lock file parsers (`package-lock.json`, `yarn.lock`, `go.sum`, `pnpm-lock.yaml`)
3. Paid-only gating for lock file formats

### Phase 6: GitHub App Gating

1. Validate installation against paid keys in webhook handler
2. Friendly "upgrade" check run for free installations
