// ---------------------------------------------------------------------------
// Rate limiting middleware — Durable Object backed
//
// Tier limits (per minute):
//   - Unauthenticated (no key): 60 req/min
//   - Free key:                 60 req/min
//   - Pro key:                  120 req/min
//   - Enterprise key:           600 req/min
//
// Unauthenticated limit is generous because most responses are served from
// KV cache (~1ms, no GitHub API calls). The edge cache layer would bypass
// the rate limiter entirely for cached responses, but the Cache API may not
// be functional on all zones — this higher limit compensates.
// ---------------------------------------------------------------------------

import { Context, Next } from 'hono';
import type { Env } from '../scoring/types';
import type { Tier } from '../cache/index';

const WINDOW_MS = 60 * 1000; // 1 minute

const TIER_LIMITS: Record<Tier, number> = {
  free: 60,
  pro: 120,
  enterprise: 600,
};

/** Unauthenticated (no API key) limit */
const UNAUTHENTICATED_LIMIT = 60;

type AppEnv = { Bindings: Env; Variables: { tier: Tier; keyName: string | null } };

/**
 * Rate limiter using Durable Objects for atomic, strongly consistent counters.
 */
export async function rateLimit(c: Context<AppEnv>, next: Next) {
  const keyName = c.get('keyName');
  const isAuthenticated = !!c.get('keyName');
  const tier = (c.get('tier') || 'free') as Tier;
  const limitValue = isAuthenticated ? (TIER_LIMITS[tier] || TIER_LIMITS['free']) : UNAUTHENTICATED_LIMIT;

  // Rate limit key: by API key name if authenticated, by IP if not
  const ip = c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for') ?? 'unknown';
  const rateLimitKey = isAuthenticated ? `key:${keyName}` : `ip:${ip}`;

  // Get or create a Durable Object for this rate-limit key
  const id = c.env.RATE_LIMITER.idFromName(rateLimitKey);
  const stub = c.env.RATE_LIMITER.get(id);

  const doRes = await stub.fetch(
    new Request(`https://rate-limiter.internal/check?limit=${limitValue}&window=${WINDOW_MS}`),
  );
  const result = await doRes.json() as {
    allowed: boolean;
    remaining: number;
    limit: number;
    count: number;
    resetMs: number;
  };

  // Set headers regardless of outcome
  c.header('X-RateLimit-Limit', String(result.limit));
  c.header('X-RateLimit-Remaining', String(result.remaining));
  c.header('X-RateLimit-Tier', tier);

  if (!result.allowed) {
    c.header('Retry-After', String(Math.ceil(result.resetMs / 1000)));
    return c.json(
      {
        error: 'Rate limit exceeded',
        limit: result.limit,
        tier,
        authenticated: isAuthenticated,
        remaining: 0,
        retryAfterSeconds: Math.ceil(result.resetMs / 1000),
        message: isAuthenticated
          ? `Upgrade to a higher tier for more requests. Current: ${tier} (${result.limit}/min).`
          : `Add an API key for higher limits. Current (unauthenticated): ${result.limit}/min.`,
      },
      429,
    );
  }

  return next();
}
