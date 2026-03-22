// ---------------------------------------------------------------------------
// Rate limiting middleware — native Cloudflare Rate Limiting
//
// Two-level infra protection (not billing — that's handled by usage quotas):
//   - Unauthenticated (no key): 10 req/min per IP     (edge-cached, shouldn't hit Worker often)
//   - Authenticated (any key):  1000 req/min per key   (identified client, higher burst allowed)
//
// Rate limiting prevents a single client from starving others. Tier-based
// usage billing is a separate concern tracked via usage events → Iceberg.
// ---------------------------------------------------------------------------

import { Context, Next } from 'hono';
import type { Env } from '../scoring/types';

const ANON_LIMIT = 10;
const AUTH_LIMIT = 1000;

type AppEnv = { Bindings: Env; Variables: { tier: string; keyName: string | null; isAuthenticated: boolean } };

/**
 * Rate limiter using native Cloudflare Rate Limiting bindings.
 *
 * Two bindings configured in wrangler.toml:
 *   RATE_LIMITER_ANON  → 10 req/min  (keyed by IP)
 *   RATE_LIMITER_AUTH  → 1000 req/min (keyed by API key name)
 */
export async function rateLimit(c: Context<AppEnv>, next: Next) {
  const isAuthenticated = c.get('isAuthenticated') ?? false;
  const keyName = c.get('keyName');

  // Pick binding and key based on auth status
  const rateLimiter = isAuthenticated ? c.env.RATE_LIMITER_AUTH : c.env.RATE_LIMITER_ANON;
  const limit = isAuthenticated ? AUTH_LIMIT : ANON_LIMIT;

  const ip = c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for') ?? 'unknown';
  const rateLimitKey = isAuthenticated ? `key:${keyName}` : `ip:${ip}`;

  const result = await rateLimiter.limit({ key: rateLimitKey });

  // Set headers regardless of outcome
  c.header('X-RateLimit-Limit', String(limit));

  if (!result.success) {
    c.header('Retry-After', '60');
    return c.json(
      {
        error: 'Rate limit exceeded',
        limit,
        authenticated: isAuthenticated,
        retryAfterSeconds: 60,
        message: isAuthenticated
          ? `Rate limit exceeded (${limit}/min). Please slow down.`
          : `Rate limit exceeded (${limit}/min). Add an API key for higher limits.`,
      },
      429,
    );
  }

  return next();
}
