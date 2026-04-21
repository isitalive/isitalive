// ---------------------------------------------------------------------------
// Three-tier caching with stale-while-revalidate
//
// IMPORTANT (ADR-006): CDN-Cache-Control / s-maxage does NOT prevent Worker
// invocations. Every request wakes the Worker (~$0.30/M). The Cache API (L1)
// is Worker-internal (free read/write ops), not CDN-external.
//
// L1: Cloudflare Cache API — free ops, ~0ms, per-datacenter, volatile
// L2: Workers KV — $0.50/M reads, ~1ms, globally replicated, persistent
// SWR: managed via KV storedAt timestamps (Cache API doesn't support SWR)
//
// Flow:
//   1. Check Cache API (L1) — instant, free, same-datacenter
//   2. Miss → Check KV (L2) — fast, persistent, globally replicated
//      a. Write result to Cache API for next same-datacenter hit
//   3. Miss → Fetch from provider, write to both L1 + L2
//   4. Stale (KV only) → serve + trigger background revalidation
// ---------------------------------------------------------------------------

import type { ScoringResult } from '../scoring/types';
import type { Env } from '../types/env';
import { METHODOLOGY } from '../scoring/methodology';

const CACHE_PREFIX = `isitalive:${METHODOLOGY.version}:`;

// Cache API uses a synthetic URL as the key
const CACHE_DOMAIN = 'https://cache.isitalive.dev';

// ---------------------------------------------------------------------------
// Tier definitions
// ---------------------------------------------------------------------------

export type Tier = 'free' | 'pro' | 'enterprise';

interface TierConfig {
  /** Max age in seconds before a result is considered stale (KV) */
  freshTtl: number;
  /** Max age in seconds before a stale result is too old to serve at all (KV) */
  staleTtl: number;
  /** Cache API TTL — how long L1 holds the result */
  l1Ttl: number;
}

export const TIERS: Record<Tier, TierConfig> = {
  free: {
    freshTtl: 24 * 60 * 60,     // 24h — fresh
    staleTtl: 48 * 60 * 60,     // 48h — serve stale up to 2 days
    l1Ttl: 24 * 60 * 60,        // 24h in Cache API
  },
  pro: {
    freshTtl: 1 * 60 * 60,      // 1h fresh
    staleTtl: 6 * 60 * 60,      // 6h stale window
    l1Ttl: 1 * 60 * 60,         // 1h in Cache API
  },
  enterprise: {
    freshTtl: 15 * 60,           // 15min fresh
    staleTtl: 1 * 60 * 60,      // 1h stale window
    l1Ttl: 15 * 60,             // 15min in Cache API
  },
};

/** KV max TTL — also the hard cap for the degraded-fallback window. */
const KV_MAX_TTL = 7 * 24 * 60 * 60;
const DEGRADED_FALLBACK_MAX_AGE_S = KV_MAX_TTL;

// ---------------------------------------------------------------------------
// Stored shape (wraps ScoringResult with metadata for KV)
// ---------------------------------------------------------------------------

interface CachedEntry {
  result: ScoringResult;
  storedAt: number; // epoch ms
}

// ---------------------------------------------------------------------------
// Cache read — three-tier lookup
// ---------------------------------------------------------------------------

export type CacheStatus = 'l1-hit' | 'l2-hit' | 'l2-stale' | 'l3-miss';

export interface CacheResult {
  result: ScoringResult | null;
  status: CacheStatus;
  /** How old the cached data is in seconds (null if miss or L1 hit) */
  ageSeconds: number | null;
  /** ISO timestamp when the data was originally fetched */
  storedAt: string | null;
  /** ISO timestamp when this data will become stale for this tier */
  freshUntil: string | null;
  /** ISO timestamp when this data expires entirely for this tier */
  staleUntil: string | null;
}

// ---------------------------------------------------------------------------
// CacheManager class
// ---------------------------------------------------------------------------

export class CacheManager {
  constructor(private env: Env, private ctx?: ExecutionContext) {}

  private kvKey(provider: string, owner: string, repo: string): string {
    return `${CACHE_PREFIX}${provider}/${owner.toLowerCase()}/${repo.toLowerCase()}`;
  }

  private l1CacheUrl(provider: string, owner: string, repo: string): string {
    return `${CACHE_DOMAIN}/${METHODOLOGY.version}/${provider}/${owner.toLowerCase()}/${repo.toLowerCase()}`;
  }

  private responseCacheRequest(request: Request): Request {
    const url = new URL(request.url);
    return new Request(
      `${CACHE_DOMAIN}/response/${METHODOLOGY.version}${url.pathname}${url.search}`,
      request,
    );
  }

  private async getL1(
    provider: string,
    owner: string,
    repo: string,
  ): Promise<ScoringResult | null> {
    try {
      const cache = caches.default;
      const url = this.l1CacheUrl(provider, owner, repo);
      const response = await cache.match(new Request(url));
      if (!response) return null;
      const result = await response.json() as ScoringResult;
      return { ...result, cached: true };
    } catch {
      return null; // Cache API not available (e.g. local dev)
    }
  }

  private async putL1(
    provider: string,
    owner: string,
    repo: string,
    result: ScoringResult,
    tier: Tier = 'free',
  ): Promise<void> {
    try {
      const cache = caches.default;
      const url = this.l1CacheUrl(provider, owner, repo);
      const ttl = TIERS[tier].l1Ttl;

      const response = new Response(JSON.stringify(result), {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': `public, max-age=${ttl}`,
        },
      });

      const putPromise = cache.put(new Request(url), response);
      if (this.ctx) {
        this.ctx.waitUntil(putPromise);
      } else {
        await putPromise;
      }
    } catch {
      // Cache API not available — silently skip
    }
  }

  /**
   * Consolidates L1 fast-path and L2 check. Returns the same robust CacheResult.
   */
  async get(
    provider: string,
    owner: string,
    repo: string,
    tier: Tier = 'free',
  ): Promise<CacheResult> {
    // ── L1: Cache API (free, same-datacenter) ─────────────────────
    const l1Result = await this.getL1(provider, owner, repo);
    if (l1Result) {
      return { result: l1Result, status: 'l1-hit', ageSeconds: null, storedAt: null, freshUntil: null, staleUntil: null };
    }

    // ── L2: KV (persistent, global) ───────────────────────────────
    const key = this.kvKey(provider, owner, repo);
    const entry = await this.env.CACHE_KV.get(key, 'json') as CachedEntry | null;

    if (!entry) {
      return { result: null, status: 'l3-miss', ageSeconds: null, storedAt: null, freshUntil: null, staleUntil: null };
    }

    const ageSeconds = Math.round((Date.now() - entry.storedAt) / 1000);
    const config = TIERS[tier];
    const storedAt = new Date(entry.storedAt).toISOString();
    const freshUntil = new Date(entry.storedAt + config.freshTtl * 1000).toISOString();
    const staleUntil = new Date(entry.storedAt + config.staleTtl * 1000).toISOString();

    if (ageSeconds <= config.freshTtl) {
      // Fresh from KV — also populate L1 for next same-datacenter hit
      // We don't await putL1 here to avoid blocking KV hit
      const p = this.putL1(provider, owner, repo, entry.result, tier);
      if (this.ctx) {
        this.ctx.waitUntil(p);
      }
      return {
        result: { ...entry.result, cached: true },
        status: 'l2-hit',
        ageSeconds, storedAt, freshUntil, staleUntil,
      };
    }

    if (ageSeconds <= config.staleTtl) {
      // Stale — serve + caller triggers background revalidation
      return {
        result: { ...entry.result, cached: true },
        status: 'l2-stale',
        ageSeconds, storedAt, freshUntil, staleUntil,
      };
    }

    // Too old
    return { result: null, status: 'l3-miss' as const, ageSeconds, storedAt, freshUntil, staleUntil };
  }

  /**
   * Bypasses per-tier freshness gates and returns any cached entry within
   * the hard fallback cap. Used by the check endpoint's catch block to
   * serve degraded-but-useful data when GitHub is unavailable.
   */
  async getAny(
    provider: string,
    owner: string,
    repo: string,
  ): Promise<{ result: ScoringResult; ageSeconds: number; storedAt: string } | null> {
    const key = this.kvKey(provider, owner, repo);
    const entry = await this.env.CACHE_KV.get(key, 'json') as CachedEntry | null;
    if (!entry) return null;
    const ageSeconds = Math.round((Date.now() - entry.storedAt) / 1000);
    if (ageSeconds > DEGRADED_FALLBACK_MAX_AGE_S) return null;
    return {
      result: { ...entry.result, cached: true },
      ageSeconds,
      storedAt: new Date(entry.storedAt).toISOString(),
    };
  }

  /**
   * Handles putting results into L1 and L2 concurrently.
   */
  async put(
    provider: string,
    owner: string,
    repo: string,
    result: ScoringResult,
    tier: Tier = 'free',
  ): Promise<void> {
    const key = this.kvKey(provider, owner, repo);
    const entry: CachedEntry = {
      result,
      storedAt: Date.now(),
    };

    // L2: KV (persistent)
    const kvPromise = this.env.CACHE_KV.put(key, JSON.stringify(entry), {
      expirationTtl: KV_MAX_TTL,
    });
    
    // L1: Cache API (free, same-datacenter)
    const l1Promise = this.putL1(provider, owner, repo, result, tier);

    if (this.ctx) {
      this.ctx.waitUntil(Promise.all([kvPromise, l1Promise]));
    } else {
      await Promise.all([kvPromise, l1Promise]);
    }
  }

  /**
   * L1 Response caching fast-path for full responses (anonymous only).
   */
  async getResponse(request: Request, isAuthenticated: boolean): Promise<Response | null> {
    if (isAuthenticated) return null;
    try {
      const cache = caches.default;
      const cachedResponse = await cache.match(this.responseCacheRequest(request));
      if (cachedResponse) {
        console.log(`⚡ Cache HIT for: ${request.url}`);
        // Return a mutable copy — caches.default.match() returns immutable
        // headers which causes TypeError when Hono middleware (e.g.
        // secureHeaders) tries to add/modify response headers.
        return new Response(cachedResponse.body, cachedResponse);
      }
    } catch {
      // ignore
    }
    return null;
  }

  /**
   * Cache a full response in L1.
   */
  async putResponse(request: Request, response: Response): Promise<void> {
    try {
      const cache = caches.default;
      const promise = cache.put(this.responseCacheRequest(request), response.clone());
      if (this.ctx) {
        this.ctx.waitUntil(promise);
      } else {
        await promise;
      }
    } catch {
      // ignore
    }
  }
}

// ---------------------------------------------------------------------------
// Cache-Control headers for downstream (browser)
//
// Two separate concerns:
//   Cache-Control: browser caching (per-tier TTL)
//   CDN-Cache-Control: Cloudflare CDN edge caching
//
// NOTE (ADR-006): CDN-Cache-Control does NOT prevent Worker invocations.
// The Worker always wakes (~$0.30/M). These headers control the L1 Cache API
// behavior within the Worker and downstream browser caching.
// Authenticated requests get private,no-store so every request hits Worker.
// ---------------------------------------------------------------------------

export interface CacheHeaders {
  'Cache-Control': string
  'CDN-Cache-Control': string
}

export function cacheControlHeaders(tier: Tier, isAuthenticated: boolean): CacheHeaders {
  const config = TIERS[tier]
  const swr = config.staleTtl - config.freshTtl

  if (isAuthenticated) {
    return {
      // Authenticated: prevent browser/proxy caching so every request hits the Worker
      'Cache-Control': 'private, no-store',
      'CDN-Cache-Control': 'private, no-store',
    }
  }

  // Anonymous: CDN caches for 24h, browser uses tier TTL
  return {
    'Cache-Control': `public, max-age=${config.l1Ttl}, stale-while-revalidate=${swr}`,
    'CDN-Cache-Control': `public, s-maxage=86400`,
  }
}

// ---------------------------------------------------------------------------
// First-seen tracking — records when a repo was first indexed
// ---------------------------------------------------------------------------

const FIRST_SEEN_PREFIX = 'isitalive:first-seen:';

/**
 * Record the first time we ever saw a repo (idempotent — only writes once).
 *
 * Uses a read-before-write pattern to preserve the original "first seen"
 * timestamp. The KV read ($0.50/M) only happens on cache misses, so the
 * cost is acceptable for data accuracy.
 */
export async function trackFirstSeen(
  kv: KVNamespace,
  provider: string,
  owner: string,
  repo: string,
): Promise<void> {
  const key = `${FIRST_SEEN_PREFIX}${provider}/${owner.toLowerCase()}/${repo.toLowerCase()}`;
  const existing = await kv.get(key);
  if (!existing) {
    await kv.put(key, new Date().toISOString(), { expirationTtl: 365 * 24 * 60 * 60 });
  }
}

/**
 * Get the first time a repo was indexed (null if never seen).
 */
export async function getFirstSeen(
  kv: KVNamespace,
  provider: string,
  owner: string,
  repo: string,
): Promise<string | null> {
  const key = `${FIRST_SEEN_PREFIX}${provider}/${owner.toLowerCase()}/${repo.toLowerCase()}`;
  return await kv.get(key);
}
