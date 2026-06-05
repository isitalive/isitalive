# ADR-008: Free To Use Limits Without Pricing

**Status**: Accepted
**Date**: 2026-06-05
**Authors**: @fforootd
**Supersedes**: Public pricing, paid-tier freshness, and OIDC monthly quota decisions in ADR-002, ADR-004, ADR-006, and ADR-007 for the free-to-use launch.

## Context

Early IsItAlive value comes from usage, score history, dependency snapshots, trending, and repeated maintenance observations. Public pricing and paid-tier copy add friction before the product has enough historical data to sell confidently.

At the same time, every request invokes the Worker. Free access still needs hard infrastructure limits to protect Cloudflare costs and upstream GitHub API budget.

## Decision

Launch as free to use with no public pricing page, no paid plan cards, and no upgrade CTAs.

Use two public request limits:

| Access | Limit | Key |
| --- | ---: | --- |
| Anonymous | 5 requests/min | IP, scoped by repo for high-cost repo routes |
| Authenticated API key or GitHub Actions OIDC | 50 requests/min | API key name or OIDC repository identity |

Keep admin login protection at 10 attempts/min per IP.

All runtime access uses the same cache policy:

| Fresh | Stale | L1 |
| ---: | ---: | ---: |
| 24h | 48h | 24h |

Existing API-key records may still contain legacy `pro` or `enterprise` tier strings, but request auth normalizes every valid key to runtime tier `free`.

Remove the 500 deps/month GitHub Actions OIDC quota. Abuse protection is the authenticated 50/min rate limit plus cache-first scoring.

## Consequences

- More public and CI usage should flow into usage, result, provider, manifest, first-seen, trending, and history datasets.
- There is no billing enforcement or public paid-tier promise in the active launch policy.
- Current public copy lists what is free to use now without making roadmap promises.
