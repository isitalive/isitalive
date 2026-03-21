# ADR-001: Event-Driven Architecture with Iceberg Data Lake

**Status**: Accepted  
**Date**: 2026-03-21  
**Authors**: @fforootd

## Decision

### Everything Is a Typed Event

We define **4 event domains** that cover all data flowing through the system:

| Domain | Description | Iceberg Table |
|---|---|---|
| **`provider`** | Raw data fetched from upstream APIs (GitHub, npm, etc.) | `provider_events` |
| **`result`** | Computed health scores + signal breakdowns | `result_events` |
| **`usage`** | Who/what/when/where accessed the service | `usage_events` |
| **`manifest`** | Dependency scanning: parsed manifests + per-dep results | `manifest_events` |

### Iceberg Is the Source of Truth

All events flow through **Cloudflare Pipelines** into **Iceberg tables** stored in a single R2 bucket (`isitalive-data`), managed by the **R2 Data Catalog** (Cloudflare's native Iceberg catalog).

### KV Is a Materialized View

Every piece of "state" that was previously maintained in KV (trending, tracked repos, score history, first-seen, sitemap) becomes an **aggregation query over Iceberg**, cached in KV by cron. This is the **CQRS pattern** — Commands (events) are separated from Queries (aggregations).

### Architecture Pattern

```
Route Handlers → Pipelines → Iceberg → Cron Aggregation → KV Cache → UI/API
```

### KV Naming Convention

`{namespace}:{domain}:{key}` — e.g., `ita:cache:score:github/vercel/next.js`

### Iceberg Compaction

~~A `CompactionWorkflow` runs daily to merge small Parquet files into larger ones (~128MB), preventing scan degradation.~~

**Update**: Cloudflare's [R2 Data Catalog automatic compaction](https://developers.cloudflare.com/changelog/post/2025-09-25-data-catalog-compaction/) handles this natively. No manual compaction workflow needed.

### Eventual Consistency

Trending and tracked data has up to 10-minute latency (cron interval). This is acceptable — trending is cosmetic, and `recent-queries` stays instant via direct KV write.

## Consequences

### Positive
- SQL-queryable analytics over all historical data
- Race conditions and state-drift bugs eliminated
- Clean separation of concerns (4 domains)
- Admin dashboard queries Iceberg directly
- Petabyte-scale analytics without infrastructure management

### Negative
- 10-minute eventual consistency for derived state
- Compaction maintenance required
- Pipelines is in open beta (low risk — backed by R2)
- R2 SQL costs scale with query frequency

## Event Envelope

```typescript
interface Event<D extends string, T> {
  domain: D
  timestamp: string   // ISO-8601
  id: string          // unique event ID
  data: T             // domain-specific payload
}
```

## Pipeline Configuration

| Pipeline | Binding | Stream | Key Fields |
|---|---|---|---|
| `isitalive-provider-events` | `PROVIDER_PIPELINE` | `provider-events` | timestamp, provider, owner, repo, raw_json |
| `isitalive-result-events` | `RESULT_PIPELINE` | `result-events` | timestamp, provider, owner, repo, score, verdict, signals_json |
| `isitalive-usage-events` | `USAGE_PIPELINE` | `usage-events` | timestamp, repo, source, api_key_hash, cache_status, country, colo, client_type, response_time_ms, hashed_ip |
| `isitalive-manifest-events` | `MANIFEST_PIPELINE` | `manifest-events` | timestamp, manifest_hash, format, dep_count, avg_score, conclusion, trigger, installation_id, repo |

## Aggregation Queries (Cron → KV Cache)

| Materialized View | Query Pattern |
|---|---|
| Trending | `SELECT repo, COUNT(*), AVG(score) FROM usage_events WHERE timestamp > NOW() - 24h GROUP BY repo ORDER BY count DESC LIMIT 50` |
| Tracked | `SELECT repo, MAX(timestamp), COUNT(*) FROM usage_events WHERE timestamp > NOW() - 30d GROUP BY repo` |
| History | `SELECT DATE(timestamp), score, verdict FROM result_events WHERE repo = ? ORDER BY day` |
| Sitemap | `SELECT repo FROM usage_events GROUP BY repo ORDER BY COUNT(*) DESC LIMIT 5000` |

## Source Structure

```
src/events/      — typed event builders (envelope, provider, result, usage, manifest)
src/pipeline/    — Pipeline emit functions (replaces src/queue/)
src/aggregate/   — Iceberg SQL → KV cache (trending, tracked, history, sitemap)
```
