# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/).

## [0.12.0] - 2026-04-21

### Security

- **Admin login brute-force protection** — POST `/admin/auth/login` is now guarded by a dedicated per-IP rate-limit binding (`RATE_LIMITER_ADMIN`, 10 attempts/min). On trip the endpoint returns the same generic 401 page as a bad-secret failure so rate-limit state is not disclosed.
- **Abuse hardening for high-cost UI routes** — `/_data/deps/*` and `/_view` now run through the same auth-aware rate limiter used by API routes, reducing unauthenticated event spam and expensive dependency-hydration abuse.
- **Bounded body parsing on public form endpoints** — Turnstile-gated routes (`/_check`, `/_audit`) and waitlist submissions now enforce strict request-size caps and return 413 on oversized payloads.
- **GitHub Actions pinned to commit SHAs** — `.github/workflows/ci.yml` and `audit.yml` now pin `actions/checkout`, `actions/setup-node`, and `isitalive/audit-action` to exact SHAs (previously `@v6` / `@main`). The audit-action pin in particular closes a supply-chain vector since it runs with `id-token: write`.
- **`npm audit` CI gate** — CI now runs `npm audit --audit-level=high` after `npm ci`; high/critical advisories fail the build. Bumped transitive dev deps (picomatch, vite) to clear existing advisories.
- **Sanitized parse errors** — `POST /api/manifest` no longer echoes inner parser messages (`Parse error: <leaked details>`); instead returns `{error: "Invalid manifest format", error_code: "invalid_manifest"}`.

### Added

- **Structured `error_code` on error responses** — `/api/check` and `/api/manifest` JSON errors now include a machine-readable `error_code` (`not_found`, `github_rate_limited`, `github_timeout`, `github_circuit_open`, `upstream_error`, `invalid_manifest`, `payload_too_large`, `invalid_json`). OpenAPI schema updated.
- **Serve-stale fallback on upstream failure** — when GitHub is unavailable, `/api/check` now serves the last cached score (within a 7-day hard cap) with `degraded: true`, `X-Cache: L2-STALE-DEGRADED`, and `Cache-Control: no-store`. Only returns 503/504 when no cache exists at all. KV retention extended from 48h to 7 days to widen the degraded-fallback window.
- **Circuit breaker for GitHub** — three consecutive retryable failures within 60s trip a 30s fail-fast window. Paired with serve-stale, this bounds the Worker CPU cost of a sustained GitHub outage. State is backed by `CACHE_KV` (`cb:github`) so it survives isolate restarts.
- **Dependency-aware `/health`** — now probes `CACHE_KV` with an 80ms budget and returns `{status, kv, version, probeMs}`; 503 when KV fails. `Cache-Control: no-store`.
- **`unhandledrejection` handler** — the Worker entry (`src/index.ts`) logs structured JSON for silent `waitUntil` rejections, making background pipeline/cron failures visible in Cloudflare Observability.
- **Pipeline emit retry + timeout** — each `env.*_PIPELINE.send()` is now wrapped in a 3-attempt retry with 250/500ms backoff and a 2s per-attempt timeout. Reduces data loss on transient pipeline hiccups while remaining fire-and-forget.
- **Per-repo anonymous rate-limit key** — `/api/check/*` anonymous requests now include `owner/repo` in the rate-limit key so one viral repo cannot starve the per-IP budget for every other project (`/api/manifest` is unaffected).

### Changed

- **HTTP status remap for upstream errors on `/api/check`** — previously all non-404 upstream failures returned 502. Now: 504 on timeout, 503 on GitHub rate-limit and when the circuit is open, 502 only on other upstream errors. Responses also include `error_code` (see Added). Callers parsing the old `{error: string}` shape continue to work since the new fields are additive.



### Added

- **Result page rework** — 2-column dashboard grid with stacked dep count chips, slim 30-day score history bar chart with hover tooltips, collapsible Embed & API section, install CTA, and skeleton shimmer loading
- **Pricing page** with tier cards and Turnstile-protected waitlist email collection (constant-time response, SHA-256 hashed KV keys)
- **ADR-007: GTM & Billing** — Go-to-market strategy and billing architecture
- CF Web Analytics proxy — beacon and RUM served from own domain (`/t/a.js`, `/t/d`) to bypass ad blocker filter lists
- `_headers` file build step for static asset security headers (CSP)
- Waitlist endpoint tests (constant response, KV hashing)
- `secureHeaders` and ETag test coverage

### Changed

- **Migrated to Hono built-in helpers** — replaced custom security headers with `secureHeaders`, custom ETag with `etag`, manual cookie handling with `getCookie`/`setCookie`/`deleteCookie`, custom JWT with `verifyWithJwks`/`sign`, and boilerplate middleware with `createMiddleware`
- **Repo names normalized to lowercase** at all route entry points (`check.ts`, `badge.ts`, `ui.ts`) — prevents duplicate cache entries, mixed-case display in recent queries, and inconsistent URLs; non-lowercase UI URLs now 301-redirect to canonical lowercase form
- Badge endpoint exempted from rate limiting

### Fixed

- Mobile hamburger menu not toggling nav links on small screens
- Mobile nav items misaligned and nav background not opaque on scroll
- Pricing card centering, container width, and form sizing on mobile
- Turnstile form submission racing with token after back-navigation — now gates on fresh token
- Mixed-case repo names in recent query chips (e.g. `BurntSushi/toml` displayed with original GitHub casing)
- Trending aggregation now uses `usage_events` (all checks) instead of `result_events_v2` (score recomputes only), fixing intermittent/under-counted trending rankings when cache hit rates are high

## [0.10.0] - 2026-03-22

### Added

- **ADR-006: Static Assets, Worker Caching & Cost Architecture** — corrects the assumption that Workers can sit behind CDN cache (they can't); documents Cache API + KV as optimal strategy; includes full cost model
- **Phase 2: Static Assets** — pre-render 10 UI pages at build time; served by Cloudflare Static Assets without invoking the Worker (free & unlimited). Includes `scripts/build-static.ts`, custom `.md` loader, and `[assets]` config in `wrangler.toml`
- `X-Manifest-Hash` fast-path on `POST /api/manifest` — Worker checks L1/L2 cache *before* parsing JSON body, returning in <1ms CPU on cache hits; hash normalized to lowercase for case-insensitive matching
- AI-friendly 429 response: short `message` for humans, separate `hint` and `upgrade_url` fields for programmatic use by AI agents
- `npm run build` / `npm run predeploy` scripts — auto-build static assets before deploy

### Changed

- **Anonymous rate limit tightened** from 10 to 5 req/min per IP — every request wakes Worker (~$0.30/M), ADR-006
- OIDC private-repo 401 message now includes pricing link and `ISITALIVE_API_KEY` instructions (PLG upsell)
- ADR-005 updated to reference ADR-006: corrected architecture diagram, decision chain, invariants, and implementation status
- Cache comments in `cache/index.ts` corrected: `CDN-Cache-Control` does NOT prevent Worker invocations
- Audit result page API embed changed from removed GET endpoint to `curl -X POST` with `X-Manifest-Hash`

### Removed

- `GET /api/manifest/hash/:hash` endpoint and OpenAPI spec — Workers always invoke, making the GET a redundant round-trip at the same $0.30/M cost (ADR-006)
- `.DS_Store` from git tracking

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
