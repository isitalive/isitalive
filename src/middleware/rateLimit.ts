// ---------------------------------------------------------------------------
// Rate limiting middleware — Durable Object backed
//
// Tier limits (per hour):
//   - Unauthenticated (no key): 10 req/hr
//   - Free key:                 100 req/hr
//   - Pro key:                  1,000 req/hr
//   - Enterprise key:           10,000 req/hr
//
// Each unique rate-limit key gets its own Durable Object instance
// with an atomic sliding window counter.
// ---------------------------------------------------------------------------

import { Context, Next } from 'hono';
import type { Env } from '../scoring/types';
import type { Tier } from '../cache/index';

const WINDOW_MS = 3600 * 1000; // 1 hour

const TIER_LIMITS: Record<Tier, number> = {
  free: 100,
  pro: 1000,
  enterprise: 10000,
};

/** Unauthenticated (no API key) limit */
const UNAUTHENTICATED_LIMIT = 10;

type AppEnv = { Bindings: Env; Variables: { tier: Tier; keyName: string | null } };

/**
 * Rate limiter using Durable Objects for atomic, strongly consistent counters.
 */
export async function rateLimit(c: Context<AppEnv>, next: Next) {
  const tier: Tier = c.get('tier');
  const keyName = c.get('keyName');
  const isAuthenticated = keyName !== null;

  const limit = isAuthenticated ? TIER_LIMITS[tier] : UNAUTHENTICATED_LIMIT;

  // Rate limit key: by API key name if authenticated, by IP if not
  const ip = c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for') ?? 'unknown';
  const rateLimitKey = isAuthenticated ? `key:${keyName}` : `ip:${ip}`;

  // Get or create a Durable Object for this rate-limit key
  const id = c.env.RATE_LIMITER.idFromName(rateLimitKey);
  const stub = c.env.RATE_LIMITER.get(id);

  const doRes = await stub.fetch(
    new Request(`https://rate-limiter.internal/check?limit=${limit}&window=${WINDOW_MS}`),
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
          ? `Upgrade to a higher tier for more requests. Current: ${tier} (${limit}/hr).`
          : 'Add an API key (Authorization: Bearer <key>) for higher limits. Register at isitalive.dev.',
      },
      429,
    );
  }

  return next();
}
