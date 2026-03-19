// ---------------------------------------------------------------------------
// Rate limiting middleware — tiered limits via KV
//
// Tier limits (per hour):
//   - free (no key):    10 req/hr  (enough for a quick test)
//   - free (with key):  100 req/hr
//   - pro:              1,000 req/hr
//   - enterprise:       10,000 req/hr
// ---------------------------------------------------------------------------

import { Context, Next } from 'hono';
import type { Env } from '../scoring/types';
import type { Tier } from '../cache/index';

const WINDOW_SECONDS = 3600; // 1 hour

const TIER_LIMITS: Record<Tier, number> = {
  free: 100,
  pro: 1000,
  enterprise: 10000,
};

/** Unauthenticated (no API key) limit */
const UNAUTHENTICATED_LIMIT = 10;

type AppEnv = { Bindings: Env; Variables: { tier: Tier; keyName: string | null } };

/**
 * IP-based rate limiter with tier awareness.
 * Authenticated users get their tier's limit, unauthenticated get a very low one.
 */
export async function rateLimit(c: Context<AppEnv>, next: Next) {
  const tier: Tier = c.get('tier');
  const keyName = c.get('keyName');
  const isAuthenticated = keyName !== null;

  const limit = isAuthenticated ? TIER_LIMITS[tier] : UNAUTHENTICATED_LIMIT;

  // Rate limit key: by API key name if authenticated, by IP if not
  const ip = c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for') ?? 'unknown';
  const rateLimitKey = isAuthenticated
    ? `ratelimit:key:${keyName}`
    : `ratelimit:ip:${ip}`;

  const current = await c.env.CACHE_KV.get(rateLimitKey, 'json') as { count: number } | null;
  const count = current?.count ?? 0;

  if (count >= limit) {
    return c.json(
      {
        error: 'Rate limit exceeded',
        limit,
        tier,
        authenticated: isAuthenticated,
        windowSeconds: WINDOW_SECONDS,
        retryAfter: WINDOW_SECONDS,
        message: isAuthenticated
          ? `Upgrade to a higher tier for more requests. Current: ${tier} (${limit}/hr).`
          : 'Add an API key (Authorization: Bearer <key>) for higher limits. Register at isitalive.dev.',
      },
      429,
    );
  }

  // Increment
  await c.env.CACHE_KV.put(rateLimitKey, JSON.stringify({ count: count + 1 }), {
    expirationTtl: WINDOW_SECONDS,
  });

  // Headers
  c.header('X-RateLimit-Limit', String(limit));
  c.header('X-RateLimit-Remaining', String(limit - count - 1));
  c.header('X-RateLimit-Tier', tier);

  return next();
}
