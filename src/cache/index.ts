// ---------------------------------------------------------------------------
// Two-tier caching with stale-while-revalidate
//
// Strategy:
//   1. KV stores results with metadata (storedAt timestamp)
//   2. On read, we check if the result is "fresh" or "stale" based on tier
//   3. Fresh → return immediately
//   4. Stale → return immediately + trigger background revalidation via waitUntil
//   5. Missing → fetch synchronously
// ---------------------------------------------------------------------------

import type { ScoringResult, Env } from '../scoring/types';

const CACHE_PREFIX = 'isitalive:v1:';

// ---------------------------------------------------------------------------
// Tier definitions
// ---------------------------------------------------------------------------

export type Tier = 'free' | 'pro' | 'enterprise';

interface TierConfig {
  /** Max age in seconds before a result is considered stale */
  freshTtl: number;
  /** Max age in seconds before a stale result is too old to serve at all */
  staleTtl: number;
  /** Edge Cache-Control max-age */
  edgeTtl: number;
}

export const TIERS: Record<Tier, TierConfig> = {
  free: {
    freshTtl: 24 * 60 * 60,     // 24h — fresh
    staleTtl: 48 * 60 * 60,     // 48h — serve stale up to 2 days
    edgeTtl: 24 * 60 * 60,      // 24h edge cache
  },
  pro: {
    freshTtl: 1 * 60 * 60,      // 1h fresh
    staleTtl: 6 * 60 * 60,      // 6h stale window
    edgeTtl: 1 * 60 * 60,       // 1h edge cache
  },
  enterprise: {
    freshTtl: 15 * 60,           // 15min fresh
    staleTtl: 1 * 60 * 60,      // 1h stale window
    edgeTtl: 15 * 60,           // 15min edge cache
  },
};

/** KV max TTL — longest we ever keep a record */
const KV_MAX_TTL = 48 * 60 * 60; // 48h

// ---------------------------------------------------------------------------
// Stored shape (wraps ScoringResult with metadata)
// ---------------------------------------------------------------------------

interface CachedEntry {
  result: ScoringResult;
  storedAt: number; // epoch ms
}

// ---------------------------------------------------------------------------
// Cache key
// ---------------------------------------------------------------------------

function cacheKey(provider: string, owner: string, repo: string): string {
  return `${CACHE_PREFIX}${provider}/${owner}/${repo}`;
}

// ---------------------------------------------------------------------------
// Cache read — returns result + freshness status
// ---------------------------------------------------------------------------

export type CacheStatus = 'hit' | 'stale' | 'miss';

export interface CacheResult {
  result: ScoringResult | null;
  status: CacheStatus;
}

export async function getCached(
  env: Env,
  provider: string,
  owner: string,
  repo: string,
  tier: Tier = 'free',
): Promise<CacheResult> {
  const key = cacheKey(provider, owner, repo);
  const entry = await env.CACHE_KV.get(key, 'json') as CachedEntry | null;

  if (!entry) {
    return { result: null, status: 'miss' };
  }

  const ageSeconds = (Date.now() - entry.storedAt) / 1000;
  const config = TIERS[tier];

  if (ageSeconds <= config.freshTtl) {
    // Fresh — serve directly
    return {
      result: { ...entry.result, cached: true },
      status: 'hit',
    };
  }

  if (ageSeconds <= config.staleTtl) {
    // Stale but still servable — caller should trigger background revalidation
    return {
      result: { ...entry.result, cached: true },
      status: 'stale',
    };
  }

  // Too old — treat as miss
  return { result: null, status: 'miss' };
}

// ---------------------------------------------------------------------------
// Cache write
// ---------------------------------------------------------------------------

export async function putCache(
  env: Env,
  provider: string,
  owner: string,
  repo: string,
  result: ScoringResult,
): Promise<void> {
  const key = cacheKey(provider, owner, repo);
  const entry: CachedEntry = {
    result,
    storedAt: Date.now(),
  };

  await env.CACHE_KV.put(key, JSON.stringify(entry), {
    expirationTtl: KV_MAX_TTL,
  });
}

// ---------------------------------------------------------------------------
// Cache-Control header with stale-while-revalidate
// ---------------------------------------------------------------------------

export function cacheControlHeader(tier: Tier): string {
  const config = TIERS[tier];
  const swr = config.staleTtl - config.freshTtl; // stale window
  return `public, max-age=${config.edgeTtl}, s-maxage=${config.edgeTtl}, stale-while-revalidate=${swr}`;
}
