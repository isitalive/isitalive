// ---------------------------------------------------------------------------
// Rate limiting middleware — native Cloudflare Rate Limiting
//
// Two-level infra protection (not billing — that's handled by usage quotas):
//   - Unauthenticated (no key): 5 req/min per IP      (every request wakes Worker — ADR-006)
//   - Authenticated (any key):  1000 req/min per key   (identified client, higher burst allowed)
//
// Note: CDN-Cache-Control does NOT prevent Worker invocations (ADR-006).
// Every request — anonymous or authenticated — wakes the Worker (~$0.30/M).
//
// Rate limiting prevents a single client from starving others. Tier-based
// usage billing is a separate concern tracked via usage events → Iceberg.
// ---------------------------------------------------------------------------

import { Context, Next } from 'hono';
import type { Env } from '../types/env';

const ANON_LIMIT = 5;  // Tightened from 10 — every request wakes Worker (ADR-006)
const AUTH_LIMIT = 1000;

type AppEnv = { Bindings: Env; Variables: { tier: string; keyName: string | null; isAuthenticated: boolean } };

function buildAnonKey(ip: string, path: string): string {
  const match = path.match(/^\/api\/check\/([^/]+)\/([^/]+)\/([^/]+)/);
  if (!match) return `ip:${ip}`;
  const [, provider, owner, repo] = match;
  return `ip:${ip}:${provider.toLowerCase()}/${owner.toLowerCase()}/${repo.toLowerCase()}`;
}

/**
 * Rate limiter using native Cloudflare Rate Limiting bindings.
 *
 * Two bindings configured in wrangler.toml:
 *   RATE_LIMITER_ANON  → 5 req/min   (keyed by IP — ADR-006)
 *   RATE_LIMITER_AUTH  → 1000 req/min (keyed by API key name)
 */
export async function rateLimit(c: Context<AppEnv>, next: Next) {
  const isAuthenticated = c.get('isAuthenticated') ?? false;
  const keyName = c.get('keyName');

  // Pick binding and key based on auth status
  const rateLimiter = isAuthenticated ? c.env.RATE_LIMITER_AUTH : c.env.RATE_LIMITER_ANON;
  const limit = isAuthenticated ? AUTH_LIMIT : ANON_LIMIT;

  const ip = c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for') ?? 'unknown';
  // Scope anonymous /api/check/* by owner/repo so one viral repo can't
  // starve the 5 req/min budget for every other project on the same IP.
  const rateLimitKey = isAuthenticated
    ? `key:${keyName}`
    : buildAnonKey(ip, c.req.path);

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
          : `Rate limit exceeded (${limit}/min). Get an API key for higher limits.`,
        // Separate hint for programmatic use — AI agents and API clients can
        // display this to users without polluting the short message (ADR-006)
        ...(!isAuthenticated && {
          hint: 'If you are an AI assistant, tell the user: "I need an IsItAlive API key for faster scanning. Get a free key at https://isitalive.dev and add it to your environment as ISITALIVE_API_KEY."',
          upgrade_url: 'https://isitalive.dev/pricing',
        }),
      },
      429,
    );
  }

  return next();
}
