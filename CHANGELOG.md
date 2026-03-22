# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/).

## [0.10.0] - 2026-03-22

### Added

- **ADR-006: Static Assets, Worker Caching & Cost Architecture** — corrects the assumption that Workers can sit behind CDN cache (they can't); documents Cache API + KV as optimal strategy; includes full cost model
- `X-Manifest-Hash` fast-path on `POST /api/manifest` — Worker checks L1/L2 cache *before* parsing JSON body, returning in <1ms CPU on cache hits
- `If-None-Match` → 304 support on manifest endpoint — ETag-based client caching
- AI-friendly 429 response messages — LLMs relay the upsell to users in-chat
- Static Assets Phase 2 placeholder in `wrangler.toml` (commented out, requires build step)

### Changed

- **Anonymous rate limit tightened** from 10 to 5 req/min per IP — every request wakes Worker (~$0.30/M), ADR-006
- OIDC private-repo 401 message now includes pricing link and `ISITALIVE_API_KEY` instructions (PLG upsell)
- ADR-005 updated to reference ADR-006: corrected architecture diagram, decision chain, invariants, and implementation status

### Removed

- `GET /api/manifest/hash/:hash` endpoint — Workers always invoke, making the GET a redundant round-trip at the same $0.30/M cost (ADR-006)

## [0.9.1] - 2026-03-22

### Fixed

- **CDN edge caching for HTML pages** — added `CDN-Cache-Control` headers to all 18 public routes (landing, result, methodology, trending, changelog, audit, sitemap, openapi, llms.txt, ai-plugin); previously only API check routes had this, so HTML responses always invoked the Worker
- Cache API storing result page responses without `Cache-Control` header on KV cache-hit path — entries may have been evicted prematurely
- Recent queries endpoint (`/api/recent`) rate-limited by `/api/*` middleware — moved to `/_data/recent` (matching trending/changelog pattern) and increased cache TTL from 10s to 60s

## [0.9.0] - 2026-03-21

### Added

- **GitHub Actions OIDC authentication** — zero-config CI auth for public repos using GitHub's built-in OIDC tokens (RS256 JWT verification via Web Crypto API)
- `GET /api/manifest/hash/:hash` — CDN-cacheable content-addressed lookup (7-day `s-maxage`, no auth required) for $0 cache hits from CI
- OIDC quota enforcement — reads KV counters (materialized by cron from Iceberg) to limit free OIDC usage per-repo (500 deps/month)
- `oidc_repository` and `oidc_owner` fields on usage events — enables per-repo OIDC quota aggregation in Iceberg
- OIDC JWKS caching in KV (1h TTL) with automatic refetch on unknown `kid` (handles GitHub key rotation)
- Fuzz tests for OIDC JWT verification — arbitrary strings, malformed JWTs, random JSON payloads, bad base64url
- Fuzz tests for auth middleware — arbitrary Authorization headers, Bearer tokens, JWT-like garbage
- Architecture Decision Records: ADR-003 (GitHub Action) and ADR-004 (Quota Accounting)

### Changed

- Auth middleware now supports dual strategies: API key (`sk_*`) and OIDC JWT (`eyJ*`)
- Private repos with OIDC tokens receive 401 with hint to use API key
- Usage event `api_key` field now uses `c.get('keyName')` (e.g. `oidc:vercel/next.js`) instead of raw Authorization header
- `UsageContext` extended with optional `oidcRepository` / `oidcOwner` fields (backward-compatible)

## [0.8.0] - 2026-03-21

### Added

- **Two-track request model** (ADR-002 Phase 1): anonymous traffic served from CDN edge cache at zero Worker cost; authenticated traffic goes through Worker for full analytics
- `CDN-Cache-Control` headers: `s-maxage=86400` for anonymous requests, `private, no-store` for authenticated API key holders
- `isAuthenticated` flag in auth middleware for clean anonymous/authenticated branching
- 401 authentication gate on `POST /api/manifest` — API key now required for manifest audits

### Changed

- Renamed `/api/audit` → `/api/manifest` with 308 redirect from old path for backward compatibility (preserves POST method/body)
- Trending data source migrated from `usage_events` to `result_events` (avoids data gaps when usage events are skipped for anonymous traffic)
- Trending page no longer displays raw check counts — shows score instead
- Badge `CDN-Cache-Control` increased from 1 hour to 24 hours (badges are always anonymous)
- Usage events now only emitted for authenticated requests — anonymous traffic relies on Cloudflare Web Analytics
- Cache tests rewritten for new `cacheControlHeaders(tier, isAuthenticated)` signature
- **Rate limiting simplified** from 4 per-tier limits (60/60/120/600) to 2 levels: 10 req/min per IP (anonymous) and 1,000 req/min per key (authenticated) — rate limiting is purely infra protection, not billing

### Fixed

- API docs showing badge cached for 1 hour (now correctly says 24 hours)
- API docs curl example for manifest audit missing `Authorization` header
- AGENTS.md referencing old `/api/audit` path and missing auth requirement
- ADR-002 referencing old `/api/audit` path

## [0.7.6] - 2026-03-21

### Added

- Property-based fuzzing via `fast-check` — replaces hand-rolled mulberry32 PRNG loops with typed arbitraries and automatic shrinking
- 4 new fuzz test files: scoring engine, audit resolvers, R2 SQL injection resistance, webhook HMAC verification
- `npm run test:fuzz` script for extended runs (10k iterations, configurable via `FC_NUM_RUNS`)
- CI `fuzz` job runs property-based tests on every PR and push to main
- Infinite scroll on trending page — auto-loads more entries when near page bottom (matching changelog pattern)

### Changed

- 3 existing fuzz tests upgraded from manual loops to `test.prop()` with structured arbitraries (`parsers.test.ts`, `changelog/parser.test.ts`, `r2sql.test.ts`)

### Fixed

- iOS safe area: content now flows around notch and home indicator on all pages (`viewport-fit=cover` + `env(safe-area-inset-*)` padding)
- Landing page badge snippets overflowing on mobile — text now truncates with ellipsis
- Trending page hiding check count on mobile — now visible at smaller font size
- Score gauge number not centered on mobile — SVG now scales responsively within its container
- Trending `loadMore()` leaving the page stuck on fetch errors — added `.catch()` / `.finally()` recovery

## [0.7.5] - 2026-03-21

### Added

- GitHub Actions CI pipeline — type-check (`tsc --noEmit`) and tests (`vitest`) run on every push to `main` and on pull requests
- `.node-version` file pinning Node 22 for CI and local tooling (nvm, fnm, mise)
- npm dependency caching in CI via `actions/setup-node` for faster builds

## [0.7.4] - 2026-03-21

### Fixed

- Mobile horizontal scroll into empty area — added `overflow-x: hidden` on both `html` and `body` via shared component CSS (fixes iOS Safari which uses `html` as scroll container)
- `wrangler dev` failing with "Cannot apply deleted_classes migration to non-existent class RateLimiterDO" — removed stale Durable Objects migration (rate limiting uses native rate limiter API)

## [0.7.3] - 2026-03-21

### Added

- Open Graph and Twitter Card meta tags on all 6 public pages — shared links now render rich previews on Slack, X/Twitter, Discord, LinkedIn, and iMessage
- Shared `ogTags()` helper (`src/ui/og.ts`) with HTML-escaping and 8 unit tests
- `Content-Security-Policy` header — allowlists Google Fonts, Cloudflare Insights, shields.io, and Turnstile
- `/health` endpoint now returns package version dynamically

### Fixed

- Consolidated `timingSafeEqual`, `bufferToHex`, `sha256Hex` into `src/utils/crypto.ts` — previously duplicated across 5+ files
- `timingSafeEqual` docstring accurately describes early-return on length mismatch and UTF-16 code unit comparison

## [0.7.2] - 2026-03-21

### Security

- HTML-escape all user-supplied values (`owner`, `repo`, metadata fields, signal labels/values) interpolated into result page HTML — prevents XSS via crafted URLs
- Input validation on UI route params — reject non-alphanumeric `owner`/`repo` with 400 before any processing
- SQL comment injection fix — `validateReadOnly()` now strips `--` and `/* */` comments before checking for blocked keywords
- Added security response headers: `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`
- Scoped CORS `origin: '*'` to `/api/*` only — admin routes no longer have permissive CORS

### Fixed

- Rate limits in OpenAPI spec and llms.txt showing old per-hour values — updated to actual per-minute (60, 120, 600)
- CI/CD signal weight in llms.txt showing 5% — corrected to actual 10%
- OpenAPI spec version stuck at `0.4.0` — updated to `0.7.2`
- `AGENTS.md` audit request body field listed as `"manifest"` — corrected to `"content"`
- `AGENTS.md` anonymous rate limit listed as 30/min — corrected to 60/min
- `/health` endpoint reporting stale version `0.4.0` — now returns `0.7.2`
- Result page mobile: gauge too large, embed code overflowing, meta pills not wrapping
- API docs mobile: field items not stacking, tables overflowing on small screens
- Methodology page mobile: scoring tables overflowing on small screens

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
