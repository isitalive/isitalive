# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/).

## [0.7.1] - 2026-03-21

### Fixed
- R2 SQL response parsing — `data.result` is an object `{ schema, rows }`, not an array; all Iceberg queries were silently returning zero rows
- Admin dashboard trending count reading from legacy KV key (`isitalive:trending`) instead of current key (`ita:state:trending`)
- R2 SQL preset queries using unsupported `DATE()` and `HOUR()` functions — replaced with `substring()` on ISO-8601 timestamps
- Audit cache checked too late — KV lookup moved before `parseManifest()` and `resolveAll()`, skipping expensive npm registry lookups on repeat calls
- Audit cache response now returns raw KV string directly, avoiding unnecessary JSON parse + serialize round-trip for large payloads

### Changed
- Renamed `src/routes/audit.ts` → `src/routes/manifest.ts` for clarity

## [0.7.0] - 2026-03-21

### Added
- Event-driven architecture with 4 typed domain events: `provider`, `result`, `usage`, `manifest`
- Cloudflare Pipelines integration — events stream to Iceberg tables via R2 Data Catalog
- Iceberg-backed cron aggregations for trending repos, tracked repos, sitemap, and score history
- Pipeline emit layer (`src/pipeline/emit.ts`) with fire-and-forget sends and graceful error handling
- KV key convention (`ita:{domain}:{key}`) for materialized view caching
- Schema files for all 4 event pipelines (`schemas/`)
- Architecture Decision Record (`docs/adr/001-event-driven-architecture.md`)
- Smart placement for optimal latency
- Admin query console presets: Score Distribution, Event Sources

### Changed
- Cron handler now queries Iceberg via aggregate modules instead of reading queue-maintained state
- Admin query console presets updated to use `usage_events` and `result_events` Iceberg tables
- Pipeline events now flattened before send — envelope + data merged into flat Iceberg rows
- Pipeline `send()` calls now wrap events in arrays as required by the API
- Usage event field names aligned with Iceberg schema (`api_key`, `user_agent`, `ip_hash`)
- Refresh workflow reads Iceberg-cached tracked index instead of manually maintaining it
- `revalidateInBackground` archives raw data via Pipeline instead of queue
- All route handlers (`check`, `ui`, `audit`) emit to Pipelines instead of legacy queue
- Recent queries now written directly to KV instead of through a queue consumer

### Removed
- Cloudflare Queue (`EVENTS_QUEUE`) — fully replaced by Pipelines + direct KV writes
- Queue consumer (`queue/consumer.ts`) and all queue message types (`queue/types.ts`)
- Queue-maintained tracked index (`queue/tracked.ts`) — replaced by `aggregate/tracked`
- Analytics R2 batch writes (`analytics/events.ts`) — replaced by Pipeline events
- `RAW_DATA` R2 binding — raw data now archived via Pipeline events
- Legacy queue sends for `check-event`, `archive-raw`, `first-seen`, `page-view`, `github-app-event`

## [0.6.0] - 2026-03-21

### Added
- Admin dashboard at `/admin` with session-based authentication
- Overview dashboard showing tracked repo metrics (hot/warm/cold breakdown), trending count, and rate limit configuration
- API key management UI — create, list, and revoke keys with pluggable `KeyStore` interface (KV-backed, Stripe-ready)
- R2 SQL Query Console with integrated chart visualization (line, bar, horizontal bar, donut charts)
- 8 preset analytics queries (daily volume, verdict distribution, top repos, hourly traffic, API consumers, geo distribution, cache hit ratio, client types)
- uPlot (CDN) for time-series charts, vanilla canvas for bar/donut — zero npm dependencies
- Dimension, metric, and chart type pickers for interactive data exploration
- Comprehensive auth tests with fuzz-style inputs (malicious payloads, unicode, injection attempts)
- SQL validation tests with adversarial inputs and injection pattern detection
- Data helper tests for `KVKeyStore` CRUD operations

### Security
- Admin session cookies are HMAC-SHA256 signed with `ADMIN_SECRET`
- R2 SQL proxy validates read-only queries (blocks INSERT/UPDATE/DELETE/DROP) with string-literal-aware parsing
- API tokens never exposed to the browser — all R2 SQL queries proxied through the Worker

## [0.5.1] - 2026-03-20

### Added
- Comprehensive unit tests for scoring engine and all 8 scoring rules
- Unit tests for manifest parsers (`go.mod`, `package.json`), resolver helpers, and audit scorer
- Fuzz testing for `parseGoMod()`, `parsePackageJson()`, and `parseChangelog()` with seeded PRNGs
- Unit tests for changelog parser and cache tier configuration
- Exported pure helper functions (`extractGitHub`, `resolveGopkgIn`, `resolveGoogleGolang`, `buildSummary`) for testability

## [0.5.0] - 2026-03-20

### Added
- GitHub App posts a PR comment with dependency audit summary
- Subsequent pushes update the same comment instead of creating duplicates
- `AGENTS.md` file for AI agent integration instructions
- IsItAlive health badge on README

### Fixed
- Navbar and footer width jumping between pages (now self-contained at 1000px)
- Content container widths inconsistent across pages (standardized to 900px)

## [0.4.0] - 2026-03-20

### Added
- Unified event queue (Cloudflare Queues) for all analytics and tracking
- Real-time trending computation via queue consumer (replaces R2 SQL polling)
- Client-side page view tracking via sendBeacon for accurate browser-only analytics
- Background refresh workflow to keep tracked repos fresh (2.5k/hour budget)
- Tracked repos index with priority tiers (hot/warm/cold)
- Client-side hydration for trending page and recently checked chips
- `/api/trending` and `/api/recent` JSON endpoints
- Markdown-based changelog with infinite scroll

### Changed
- Trending page loads instantly from edge cache, data hydrates client-side
- Landing page recently checked chips hydrate via `/api/recent`
- API check route migrated to unified event queue

### Fixed
- Stale edge cache serving outdated navigation on methodology page

## [0.3.0] - 2026-03-20

### Added
- Loading transition with spinner, progress bar, and page fade
- This changelog page

### Fixed
- Loading state persisting when navigating back via browser history
- GitHub org typo in footer link

## [0.2.0] - 2026-03-20

### Added
- Scoring engine with 8 weighted signals
- Stability override for finished / complete projects
- Solo-maintainer forgiveness for small repos
- Inbox-zero recognition for clean repos

### Changed
- CI/CD weight increased from 5% to 10% (fixes weight sum bug)
- Rate limits switched from per-hour to per-minute

### Fixed
- Clean repos being penalized for having zero open issues

## [0.1.0] - 2026-03-19

### Added
- Landing page with search and recent queries
- Health check result pages with score breakdown
- Trending page powered by R2 SQL + hourly cron
- Methodology page explaining all 8 signals
- REST API with tiered API key access
- Cloudflare Turnstile bot protection
- KV caching with stale-while-revalidate
- Analytics pipeline (Iceberg / R2)
- Dynamic sitemap generation
