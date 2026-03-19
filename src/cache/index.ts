// ---------------------------------------------------------------------------
// Two-tier caching: Cloudflare Cache API (edge) + Workers KV (persistent)
// ---------------------------------------------------------------------------

import type { ScoringResult, Env } from '../scoring/types';

const CACHE_PREFIX = 'isitalive:v1:';

/** Cache TTLs in seconds */
export const TTL = {
  /** Free tier: 1 hour edge cache */
  FREE_EDGE: 60 * 60,
  /** Paid tier: 15 minutes edge cache */
  PAID_EDGE: 60 * 15,
  /** KV persistent cache: 24 hours */
  KV: 60 * 60 * 24,
} as const;

function cacheKey(provider: string, owner: string, repo: string): string {
  return `${CACHE_PREFIX}${provider}/${owner}/${repo}`;
}

/**
 * Try to read a cached result.
 * 1. Check KV (persistent, always available in Workers)
 * 2. Return null if miss
 */
export async function getCached(
  env: Env,
  provider: string,
  owner: string,
  repo: string,
): Promise<ScoringResult | null> {
  const key = cacheKey(provider, owner, repo);

  // KV lookup
  const kvResult = await env.CACHE_KV.get(key, 'json');
  if (kvResult) {
    return { ...(kvResult as ScoringResult), cached: true };
  }

  return null;
}

/**
 * Write a result to both cache tiers.
 */
export async function putCache(
  env: Env,
  provider: string,
  owner: string,
  repo: string,
  result: ScoringResult,
  isPaid: boolean = false,
): Promise<void> {
  const key = cacheKey(provider, owner, repo);

  // KV — always 24h TTL
  await env.CACHE_KV.put(key, JSON.stringify(result), {
    expirationTtl: TTL.KV,
  });
}

/**
 * Build Cache-Control header for edge caching
 */
export function cacheControlHeader(isPaid: boolean): string {
  const ttl = isPaid ? TTL.PAID_EDGE : TTL.FREE_EDGE;
  return `public, max-age=${ttl}, s-maxage=${ttl}`;
}
