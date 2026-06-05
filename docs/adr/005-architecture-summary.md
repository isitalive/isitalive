# ADR-005: Architecture Summary (Checkpoint)

**Status**: Living document
**Date**: 2026-03-21
**Authors**: @fforootd

> [!NOTE]
> This ADR is not a decision — it is a **checkpoint** that summarises the current architectural state established by ADRs 001–008. Update this document whenever an ADR is added, accepted, or superseded.

## Current Architecture at a Glance

```
User / CI / Agent
       │
       ▼
Cloudflare Worker (Hono)   ← Always invoked (~$0.30/M) — ADR-006
  ├── L1 Cache API check (~0ms, free ops)
  ├── Auth (API key / OIDC)
  ├── Rate limit (infra protection)
  ├── Score / Audit
  │     ├── GitHub GraphQL API (8 signals) + REST (CI activity)
  │     └── L2 cache (free access TTL)
  ├── Emit events → Pipelines → Iceberg
  └── Response
       │
       ▼
Cron (every 10 min)
  └── Iceberg SQL → KV materialised views
        (trending, tracked, sitemap, history)

Static Assets (Phase 2 — ADR-006)
  └── UI pages served without waking Worker (free, unlimited)
```

## Decision Summary

### ADR-001 — Event-Driven Architecture with Iceberg Data Lake

All data flows through **4 typed event domains** (provider, result, usage, manifest) into Iceberg tables via Cloudflare Pipelines. KV is a materialised view populated by cron — the CQRS pattern. Derived state (trending, tracked, sitemap) has up to 10-minute eventual consistency.

### ADR-002 — Economic Viability: Tiered Access & Cost-Optimised Architecture

Anonymous traffic uses L1 Cache API (free ops, per-datacenter); Workers always wake up (~$0.30/M, corrected by ADR-006). ADR-008 supersedes the public pricing, billing, and tiered-freshness launch decisions for free-to-use access.

### ADR-003 — GitHub Action: Dependency Health Auditing in CI

A **composite GitHub Action** hashes manifest content client-side (SHA-256) and sends `POST /api/manifest` with `X-Manifest-Hash` header for fast-path cache lookup (ADR-006). ~~GET /api/manifest/hash/:hash removed~~ — Workers always wake, so it was a redundant round-trip. Public repos authenticate via **GitHub OIDC** (zero config); private CI uses an authenticated API key.

### ADR-004 — Quota Accounting & Cache Freshness Tiers

Quota events still describe when the Worker **actually scores a dependency** (Layer 3 cache miss), but ADR-008 disables monthly quota rejection. All users share the free cache policy: 24h fresh, 48h stale, 24h L1.

### ADR-007 — Go-to-Market & Billing

ADR-008 pauses the public billing launch. Keep ADR-007 as historical GTM research until a future ADR reintroduces monetization.

### ADR-008 — Free To Use Limits Without Pricing

The active policy is free to use with infrastructure limits only: anonymous traffic is limited to 5 requests/min, and authenticated API key or public GitHub Actions OIDC traffic is limited to 50 requests/min. Public pricing, waitlist signup, paid-tier copy, tiered cache freshness, and the OIDC monthly dependency quota are removed from runtime behavior and public surfaces.

## How the Decisions Chain Together

```mermaid
graph TD
    A["ADR-001<br/>Event-driven + Iceberg"] --> B["ADR-002<br/>Tiered access + CDN edge"]
    A --> C["ADR-003<br/>GitHub Action + OIDC"]
    B --> D["ADR-004<br/>Quota + cache freshness"]
    C --> D
    B -->|"updates usage<br/>event strategy"| A
    D --> E["ADR-006<br/>Worker cache + cost model"]
    B --> E
    C --> E
    E --> F["ADR-007<br/>GTM + billing"]
    B --> F
    D --> F
    F --> G["ADR-008<br/>Free to use limits"]
    D --> G
    G -->|"supersedes launch pricing<br/>and monthly quota"| B
```

- **001 → 002**: The event-driven foundation enabled the two-track model.
- **002 → 003**: The caching strategy drove the Action's hash-first POST flow.
- **002 + 003 → 004**: Quota accounting defines when events are emitted.
- **002 + 003 + 004 → 006**: Cost modelling corrected CDN assumptions and simplified manifest flow.
- **002 + 004 + 006 → 007**: GTM decisions researched billing channels and quota-based monetization.
- **008**: Supersedes the public pricing, paid-tier freshness, and monthly OIDC quota decisions for free-to-use access.

## Key Invariants

These hold true across all decisions:

| Invariant | Source |
|-----------|--------|
| ~~Anonymous single-repo checks are free (CDN edge)~~ Workers always wake | ADR-006 (corrects ADR-002) |
| Cache hits never require upstream scoring | ADR-004 |
| Score events identify dependencies scored for analytics | ADR-004, ADR-008 |
| Rate limiting is infra protection, not billing | ADR-002 |
| KV is a materialised view, not source of truth | ADR-001 |
| Events are the source of truth (Iceberg) | ADR-001 |
| OIDC auth is zero-config for public repos | ADR-003 |
| Private CI uses authenticated API keys | ADR-008 |
| Scoring uses GraphQL (most signals) + REST (CI activity) | ADR-001, impl |
| Anonymous traffic is limited to 5 requests/min | ADR-008 |
| Authenticated API key and public OIDC traffic is limited to 50 requests/min | ADR-008 |
| All runtime access uses the free access cache policy | ADR-008 |

## Implementation Status

| Area | Status | Notes |
|------|--------|-------|
| Event domains + Pipelines | ✅ Shipped | 4 pipelines active |
| KV cron aggregation | ✅ Shipped | Trending, tracked, sitemap |
| L1 (Cache API) + L2 (KV) caching | ✅ Shipped | Free ops on L1, tiered TTLs on L2 |
| Manifest audit (`POST /api/manifest`) | ✅ Shipped | X-Manifest-Hash fast path (ADR-006) |
| ~~Content-addressed GET (`/hash/:hash`)~~ | 🗑️ Removed | ADR-006: redundant Worker invocation |
| GitHub Action (`isitalive/audit-action`) | ✅ Shipped | POST-only with hash header (ADR-006) |
| OIDC auth middleware | ✅ Shipped | Public-repo validation; private CI requires API key |
| Score history (aggregate) | ✅ Shipped | On-demand Iceberg query, KV cached 6h |
| Anonymous rate limit (5/min) | ✅ Shipped | ADR-008 free-to-use limit |
| Authenticated rate limit (50/min) | ✅ Shipped | ADR-008 API key and public OIDC limit |
| AI-friendly 429 responses | ✅ Shipped | Infrastructure-limit copy only |
| Monthly quota enforcement | 🗑️ Removed | ADR-008: no OIDC 500 deps/month cap |
| Static Assets (UI pages) | ✅ Shipped | Build step emits public pages without pricing |
| Log Explorer ETL (Phase 2) | ⬜ Not started | Deferred until revenue ≥ $1k/mo |
| Lock file parsing | ⬜ Not started | Future manifest-format expansion |
| GitHub App gating | ⬜ Not started | Webhook handler accepts all installations |
| Billing integration | ⏸️ Paused | ADR-008 removes public pricing |
| Public API key signup | ⏸️ Paused | Admin-created free access keys only |
| GitHub Sponsors webhook | ⏸️ Paused | Historical ADR-007 research |

## Open Questions

- **Lock file format coverage** — which formats (yarn.lock, pnpm-lock.yaml, go.sum) to prioritise
- **Scoring algorithm versioning** — use version-tagged cache keys (e.g., `isitalive:v3:`) and roll gradually (ADR-006: avoids HIBP's "DDoS machine" flush problem)
- **Product learning** — which user workflows need more support after enough usage and history accumulate
