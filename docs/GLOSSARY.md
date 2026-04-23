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
| **Manifest Audit** | `POST /api/manifest` — accepts a `package.json` or `go.mod`, resolves all dependencies to GitHub repos, and scores each one. Requires authentication. |
| **Badge** | `GET /api/badge/{provider}/{owner}/{repo}` — returns an SVG health badge for README embedding. |
| **Trending** | A ranked list of the most-checked projects in the last 24 hours, ordered by check frequency. |

## Tiers & Access

| Term | Definition |
| --- | --- |
| **Tier** | The access level associated with an API key: `free`, `pro`, or `enterprise`. Determines rate limits and cache TTLs. |
| **Anonymous** | A request without an API key. Served from CDN edge cache (24h TTL) at zero Worker cost. No usage events emitted. |
| **Authenticated** | A request with a valid API key. Always hits the Worker for metering. Full usage events emitted. |
| **Rate Limit** | Per-key (or per-IP for anonymous) request throttle for infra protection. Anonymous: 5/min, Authenticated: 1,000/min. Separate from billing quotas. |
| **Quota** | Prepaid pool of health checks consumed per billing period. Distinct from rate limits (which protect infrastructure). |

## Caching

| Term | Definition |
| --- | --- |
| **L1 Cache** | In-Worker memory cache (Cloudflare Cache API). Fastest, shortest TTL. |
| **KV Cache** | Cloudflare KV-backed cache. Second layer, longer TTL. Supports stale-while-revalidate. |
| **SWR** | Stale-While-Revalidate — serves stale data immediately while refreshing in the background. |
| **Edge Cache** | Cloudflare CDN cache, controlled by `CDN-Cache-Control`. Anonymous requests are edge-cached for 24 hours. |
| **Cache Miss** | No cached result exists — triggers a fresh GitHub API call and scoring. |

## Events & Analytics

| Term | Definition |
| --- | --- |
| **Usage Event** | Records who checked what, when, and how. Only emitted for authenticated requests. Used for billing/metering. |
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
