// ---------------------------------------------------------------------------
// Three-tier caching with stale-while-revalidate
//
// L1: Cloudflare Cache API — free, ~0ms, per-datacenter, volatile
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

import type { ScoringResult, Env } from '../scoring/types';

const CACHE_PREFIX = 'isitalive:v1:';

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

/** KV max TTL — longest we ever keep a record */
const KV_MAX_TTL = 48 * 60 * 60; // 48h

// ---------------------------------------------------------------------------
// Stored shape (wraps ScoringResult with metadata for KV)
// ---------------------------------------------------------------------------

interface CachedEntry {
  result: ScoringResult;
  storedAt: number; // epoch ms
}

// ---------------------------------------------------------------------------
// Cache keys
// ---------------------------------------------------------------------------

function kvKey(provider: string, owner: string, repo: string): string {
  return `${CACHE_PREFIX}${provider}/${owner}/${repo}`;
}

function l1CacheUrl(provider: string, owner: string, repo: string): string {
  return `${CACHE_DOMAIN}/${provider}/${owner}/${repo}`;
}

// ---------------------------------------------------------------------------
// L1: Cache API helpers
// ---------------------------------------------------------------------------

async function getL1(
  provider: string,
  owner: string,
  repo: string,
): Promise<ScoringResult | null> {
  try {
    const cache = caches.default;
    const url = l1CacheUrl(provider, owner, repo);
    const response = await cache.match(new Request(url));
    if (!response) return null;
    const result = await response.json() as ScoringResult;
    return { ...result, cached: true };
  } catch {
    return null; // Cache API not available (e.g. local dev)
  }
}

async function putL1(
  provider: string,
  owner: string,
  repo: string,
  result: ScoringResult,
  tier: Tier = 'free',
): Promise<void> {
  try {
    const cache = caches.default;
    const url = l1CacheUrl(provider, owner, repo);
    const ttl = TIERS[tier].l1Ttl;

    const response = new Response(JSON.stringify(result), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': `public, max-age=${ttl}`,
      },
    });

    await cache.put(new Request(url), response);
  } catch {
    // Cache API not available — silently skip
  }
}

// ---------------------------------------------------------------------------
// Cache read — three-tier lookup
// ---------------------------------------------------------------------------

export type CacheStatus = 'l1-hit' | 'hit' | 'stale' | 'miss';

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

export async function getCached(
  env: Env,
  provider: string,
  owner: string,
  repo: string,
  tier: Tier = 'free',
): Promise<CacheResult> {
  // ── L1: Cache API (free, same-datacenter) ─────────────────────
  const l1Result = await getL1(provider, owner, repo);
  if (l1Result) {
    return { result: l1Result, status: 'l1-hit', ageSeconds: null, storedAt: null, freshUntil: null, staleUntil: null };
  }

  // ── L2: KV (persistent, global) ───────────────────────────────
  const key = kvKey(provider, owner, repo);
  const entry = await env.CACHE_KV.get(key, 'json') as CachedEntry | null;

  if (!entry) {
    return { result: null, status: 'miss', ageSeconds: null, storedAt: null, freshUntil: null, staleUntil: null };
  }

  const ageSeconds = Math.round((Date.now() - entry.storedAt) / 1000);
  const config = TIERS[tier];
  const storedAt = new Date(entry.storedAt).toISOString();
  const freshUntil = new Date(entry.storedAt + config.freshTtl * 1000).toISOString();
  const staleUntil = new Date(entry.storedAt + config.staleTtl * 1000).toISOString();

  if (ageSeconds <= config.freshTtl) {
    // Fresh from KV — also populate L1 for next same-datacenter hit
    await putL1(provider, owner, repo, entry.result, tier);
    return {
      result: { ...entry.result, cached: true },
      status: 'hit',
      ageSeconds, storedAt, freshUntil, staleUntil,
    };
  }

  if (ageSeconds <= config.staleTtl) {
    // Stale — serve + caller triggers background revalidation
    return {
      result: { ...entry.result, cached: true },
      status: 'stale',
      ageSeconds, storedAt, freshUntil, staleUntil,
    };
  }

  // Too old
  return { result: null, status: 'miss' as const, ageSeconds, storedAt, freshUntil, staleUntil };
}

// ---------------------------------------------------------------------------
// Cache write — writes to both L1 and L2
// ---------------------------------------------------------------------------

export async function putCache(
  env: Env,
  provider: string,
  owner: string,
  repo: string,
  result: ScoringResult,
  tier: Tier = 'free',
): Promise<void> {
  const key = kvKey(provider, owner, repo);
  const entry: CachedEntry = {
    result,
    storedAt: Date.now(),
  };

  // Write to both tiers concurrently
  await Promise.all([
    // L2: KV (persistent)
    env.CACHE_KV.put(key, JSON.stringify(entry), {
      expirationTtl: KV_MAX_TTL,
    }),
    // L1: Cache API (free, same-datacenter)
    putL1(provider, owner, repo, result, tier),
  ]);
}

// ---------------------------------------------------------------------------
// Cache-Control header for downstream (browser/CDN)
// ---------------------------------------------------------------------------

export function cacheControlHeader(tier: Tier): string {
  const config = TIERS[tier];
  const swr = config.staleTtl - config.freshTtl;
  return `public, max-age=${config.l1Ttl}, s-maxage=${config.l1Ttl}, stale-while-revalidate=${swr}`;
}
