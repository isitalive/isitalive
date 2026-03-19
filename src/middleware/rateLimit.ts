// ---------------------------------------------------------------------------
// Rate limiting middleware — sliding window counter via KV
// ---------------------------------------------------------------------------

import { Context, Next } from 'hono';
import type { Env } from '../scoring/types';

type AppEnv = { Bindings: Env; Variables: { isPaid: boolean } };

const WINDOW_SECONDS = 3600; // 1 hour
const FREE_LIMIT = 60;      // 60 requests per hour for free tier

/**
 * Simple IP-based rate limiter using KV.
 * Paid (authenticated) users bypass this.
 */
export async function rateLimit(c: Context<AppEnv>, next: Next) {
  // Paid users (with valid API key) skip rate limiting
  if (c.get('isPaid')) {
    return next();
  }

  const ip = c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for') ?? 'unknown';
  const key = `ratelimit:${ip}`;

  const current = await c.env.CACHE_KV.get(key, 'json') as { count: number } | null;
  const count = current?.count ?? 0;

  if (count >= FREE_LIMIT) {
    return c.json(
      {
        error: 'Rate limit exceeded',
        limit: FREE_LIMIT,
        windowSeconds: WINDOW_SECONDS,
        message: 'Upgrade to a paid API key for higher limits.',
      },
      429,
    );
  }

  // Increment counter
  await c.env.CACHE_KV.put(key, JSON.stringify({ count: count + 1 }), {
    expirationTtl: WINDOW_SECONDS,
  });

  // Set rate limit headers
  c.header('X-RateLimit-Limit', String(FREE_LIMIT));
  c.header('X-RateLimit-Remaining', String(FREE_LIMIT - count - 1));

  return next();
}
