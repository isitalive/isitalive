# ADR-006: Static Assets, Worker Caching & Cost Architecture

**Status**: Accepted
**Date**: 2026-03-22
**Authors**: @fforootd
**Supersedes**: Parts of ADR-002 § "CDN edge at zero Worker cost"

## Context

Investigation revealed that **Cloudflare Workers cannot sit behind the CDN cache**. The `CDN-Cache-Control` / `s-maxage` headers documented in ADR-002 do not prevent Worker invocations — they only control the Cache API (L1) *inside* the Worker, which itself requires a Worker invocation to check.

**Sources:**
- [CF Community: cache in front of worker](https://community.cloudflare.com/t/cache-in-front-of-worker/171258/13)
- [Troy Hunt: Hyperscaling HIBP with CF Workers and Caching](https://www.troyhunt.com/closer-to-the-edge-hyperscaling-have-i-been-pwned-with-cloudflare-workers-and-caching/)
- [CF Docs: How Workers interact with Cache Rules](https://developers.cloudflare.com/cache/interaction-cloudflare-products/workers-cache-rules/)
- [CF Docs: How the Cache works in Workers](https://developers.cloudflare.com/workers/reference/how-the-cache-works/)

**Correction to ADR-002:** "Anonymous traffic is served from CDN edge at **zero Worker cost**" is incorrect. Every request — anonymous or authenticated — wakes the Worker (~$0.30/M). The Cache API check inside the Worker is near-free (~0.5ms CPU), but the invocation cost is unavoidable.

## Decisions

### 1. L1 (Cache API) + L2 (KV) Is Already Optimal

CF Workers have two caching mechanisms:

| | **Cache API** (`caches.default`) | **`fetch()` subrequests** |
|--|---|---|
| Used by | ✅ Current code | ❌ Not used |
| Scope | Local datacenter only | Full CDN + Tiered Cache |
| Operation cost | **Free** (no per-op charges) | CDN cache rules apply |
| Cache Reserve | ❌ Not compatible | ✅ Compatible |

**Cache Reserve** ($4.50/M writes, $0.36/M reads, $0.015/GB storage) was evaluated and rejected — it's incompatible with Cache API and has near-identical costs to KV ($5/M writes, $0.50/M reads). The `fetch()` subrequest rework required to use it yields only ~$10/100M savings.

**Decision:** Keep L1 (Cache API, free ops) + L2 (KV, persistent). This is more economical than Cache Reserve or `fetch()` subrequests.

### 2. Static Assets for UI Pages

CF [Static Assets](https://developers.cloudflare.com/workers/static-assets/) serve files **without invoking the Worker**. Requests are **free and unlimited**.

- Add `[assets]` config to `wrangler.toml` with `run_worker_first = ["/api/*", "/admin/*", "/github/*", "/health"]`
- Pre-render UI templates (landing, methodology, terms, etc.) to static HTML at build time

> Phase 2 change requiring a build step. Documented here; implementation tracked separately.

### 3. POST-Only Manifest Flow

The GET-first (`GET /hash/:hash`) → POST-on-miss pattern was designed for CDN caching at $0. Since Workers always wake up, the GET is a redundant round-trip at the same $0.30/M cost.

**New flow:**
1. `POST /api/manifest` with `X-Manifest-Hash: <sha256>` header
2. Worker checks KV for hash *before parsing JSON body* → cached result returned in <1ms
3. `If-None-Match` support → 304 when client already has the result
4. On cache miss → parse body, score, cache by hash

This halves CI/CD network trips and eliminates JSON parsing on cache hits.

### 4. Rate Limits

Anonymous rate limit tightened from 10 to **5 req/min per IP**. Every request wakes the Worker; 24h cache means repeat anonymous hits are wasted cost.

429 responses include AI-friendly messaging so LLM agents relay the upsell.

### 5. Monetization: Price by Repos, Not Audits

Metering by "manifest audits" is hostile to CI/CD — developers can't predict how many CI triggers they'll have. Cache-hit audits cost ~$0.000015 each.

| Tier | Single checks | CI Audits | Private repos | Cache | Price |
|------|--------------|-----------|-----------|-------|-------|
| **Free (web)** | Unlimited (Turnstile) | — | — | 24h | $0 |
| **Free (OIDC)** | — | Unlimited | Public only | 24h | $0 |
| **Starter** | 10,000/mo | Unlimited | 3 | 1h | $9/mo |
| **Pro** | 50,000/mo | Unlimited | 15 | 1h | $29/mo |
| **Business** | 250,000/mo | Unlimited | Unlimited | 15min | $99/mo |

OIDC requests with `repository_visibility: 'private'` get a graceful 401 with upsell.

## Cost Model

### Pricing Reference (CF Workers Paid — $5/mo base)

| Resource | Included | Overage |
|----------|----------|---------|
| Worker requests | 10M/mo | $0.30/M |
| Worker CPU time | 30M CPU-ms/mo | $0.02/M CPU-ms |
| KV reads | 10M/mo | $0.50/M |
| KV writes | 1M/mo | $5.00/M |
| Cache API ops | Unlimited | $0 |
| Static asset requests | Unlimited | $0 |

### 100M Single Checks (~80% L1 hit rate)

| Step | Volume | Total |
|------|--------|-------|
| Worker invocations | 100M | $30.00 |
| CPU time (~1.5ms avg) | 150B ms | $3.00 |
| KV reads (20% L1 miss) | 20M | $10.00 |
| KV writes (~2% full miss) | 2M | $10.00 |
| **Total** | | **~$53** |

### 100M Manifest Audits (50 deps, 80% dep cache hit)

| Step | Volume | Total |
|------|--------|-------|
| Worker invocations | 100M | $30.00 |
| CPU time (~50ms/audit) | 5B ms | $100.00 |
| KV reads (deps + hash) | 4.1B | $2,050.00 |
| KV writes (20% miss) | 1B | $5,000.00 |
| **Total** | | **~$7,182** |

> KV writes dominate at $5/M. Mitigations: longer TTLs, aggressive Cache API usage (free writes), batch writes.

### Realistic Monthly Costs

| Scenario | Volume | Cost |
|----------|--------|------|
| Single checks | 10M/mo | ~$5 (included) |
| Single checks | 100M/mo | ~$53 |
| Manifest audits | 100K/mo | ~$12 |
| Manifest audits | 1M/mo | ~$80 |

## Consequences

- ADR-002's "zero Worker cost for anonymous traffic" is **corrected** — Worker always wakes
- `GET /api/manifest/hash/:hash` endpoint **removed** — replaced by POST with hash header
- Anonymous rate limit tightened (10 → 5/min)
- UI pages will move to Static Assets (Phase 2)
- Pricing model uses private repo count, not audit count
