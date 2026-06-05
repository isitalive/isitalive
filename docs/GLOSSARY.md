# Glossary

Common terms used throughout the IsItAlive codebase, documentation, and API.

## Core Concepts

| Term | Definition |
| --- | --- |
| **Health Check** | A scored assessment of a GitHub repository's maintenance activity. Produces a score (0–100) and a verdict. |
| **Score** | A weighted integer (0–100) derived from 8 signals. Higher is healthier. |
| **Verdict** | A human-readable label mapped from the score: `healthy` (80–100), `stable` (60–79), `degraded` (40–59), `critical` (20–39), `unmaintained` (0–19). |
| **Signal** | One of 8 individual metrics (e.g. Last Commit, PR Responsiveness) that contribute to the overall score, each with its own weight. |
| **Override** | A rule that bypasses normal scoring — e.g. archived repos are instantly scored 0, finished projects get a stability floor. |
| **Provider** | The source code hosting platform. Currently only `github`. Designed to be extensible. |
| **Project** | A fully qualified identifier: `{provider}/{owner}/{repo}` (e.g. `github/vercel/next.js`). |

## API & Endpoints

| Term | Definition |
| --- | --- |
| **Check** | `GET /api/check/{provider}/{owner}/{repo}` — returns a health score for a single repository. |
| **Manifest Audit** | `POST /api/manifest` — accepts supported manifest and lockfile formats (`package.json`, `package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`, `go.mod`, `go.sum`), resolves dependencies to GitHub repos, and scores each one. Requires authentication. |
| **Package Resolve** | `GET /api/resolve/{ecosystem}?name=...` — resolves an npm package or Go module to a GitHub repo without scoring it. |
| **Badge** | `GET /api/badge/{provider}/{owner}/{repo}` — returns an SVG health badge for README embedding. |
| **Trending** | A ranked list of the most-checked projects in the last 24 hours, ordered by check frequency. |

## Access & Limits

| Term | Definition |
| --- | --- |
| **Free To Use** | Current access model. Public checks, badges, API-key requests, and public GitHub Actions OIDC audits use the same free cache policy. |
| **Anonymous** | A request without an API key or OIDC token. Rate-limited per IP, with `/api/check` and dependency-data requests scoped by repo to avoid one popular repo starving all others. |
| **Authenticated** | A request with a valid API key or public GitHub Actions OIDC token. Rate-limited by key/OIDC identity. |
| **Rate Limit** | Request throttle for infrastructure protection. Anonymous: 5/min. Authenticated API key or public GitHub Actions OIDC: 50/min. Admin login: 10/min. |
| **Fresh Score** | A dependency or repository score computed from an upstream GitHub fetch rather than served from cache. Used for operational analytics, not billing enforcement. |

## Caching

| Term | Definition |
| --- | --- |
| **L1 Cache** | In-Worker memory cache (Cloudflare Cache API). Fastest, shortest TTL. |
| **KV Cache** | Cloudflare KV-backed cache. Second layer, longer TTL. Supports stale-while-revalidate. |
| **SWR** | Stale-While-Revalidate — serves stale data immediately while refreshing in the background. |
| **Edge Cache** | Cloudflare Cache API response cache used from inside the Worker. It keeps cached responses fast, but every request still invokes the Worker. |
| **Cache Miss** | No cached result exists — triggers a fresh GitHub API call and scoring. |

## Events & Analytics

| Term | Definition |
| --- | --- |
| **Usage Event** | Records who checked what, when, and how. Used for product analytics, trending, tracked repos, and operational insight. |
| **Result Event** | Records the score and verdict for a health check. Emitted on every cache miss (both anonymous and authenticated). Powers trending. |
| **Provider Event** | Archives the raw API response from the provider (GitHub). Emitted on cache miss. |
| **Manifest Event** | Records a manifest audit submission — what was scanned and the results. |
| **Pipeline** | Cloudflare Pipelines — streams events to Iceberg tables via R2 Data Catalog. |

## Infrastructure

| Term | Definition |
| --- | --- |
| **Worker** | A Cloudflare Worker — the serverless function that runs the application. |
| **Hono** | The lightweight HTTP framework used for routing. |
| **Turnstile** | Cloudflare's CAPTCHA alternative. Protects the website search form from bot abuse. |
| **KV** | Cloudflare Workers KV — a key-value store used for caching and state. |
| **R2** | Cloudflare R2 — object storage used for analytics data (Iceberg tables). |
| **Iceberg** | Apache Iceberg table format stored in R2. Used for analytics queries via R2 SQL. |

## GitHub App

| Term | Definition |
| --- | --- |
| **GitHub App** | An installable GitHub application that audits PR dependencies and posts status comments. |
| **PR Audit** | When the GitHub App checks dependency health on pull requests that modify manifest files. |
| **Webhook** | GitHub sends events (e.g. PR opened) to the Worker, which verifies the HMAC signature and processes the event. |
