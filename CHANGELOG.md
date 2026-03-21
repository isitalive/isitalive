# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/).

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
