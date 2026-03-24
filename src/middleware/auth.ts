// ---------------------------------------------------------------------------
// API key + OIDC authentication middleware — KV-backed
//
// Two auth strategies (in priority order):
//   1. API key:  Authorization: Bearer sk_abc123   → KV lookup in KEYS_KV
//   2. OIDC JWT: Authorization: Bearer eyJ...      → GitHub Actions OIDC verification
//   3. No auth:                                    → free tier, unauthenticated
//
// Keys are stored in the KEYS_KV namespace, managed via CF dashboard:
//   Key:   sk_abc123
//   Value: { "tier": "pro", "name": "ACME Corp", "active": true, "created": "2026-03-19" }
//
// OIDC tokens are verified against GitHub's JWKS (see ../github/oidc.ts).
// Public repos get free OIDC quota; private repos get 401.
//
// OSS-safe: actual API key values only exist in KV, never in code.
// ---------------------------------------------------------------------------

import { createMiddleware } from 'hono/factory';
import type { Env, ApiKeyEntry } from '../scoring/types';
import type { Tier } from '../cache/index';
import { verifyOidcToken, type OidcClaims } from '../github/oidc';

type AppEnv = {
  Bindings: Env;
  Variables: {
    tier: Tier;
    keyName: string | null;
    isAuthenticated: boolean;
    oidcClaims: OidcClaims | null;
  };
};

/**
 * API key + OIDC auth — looks up Bearer token in KV or verifies OIDC JWT.
 * Sets tier, key name, auth status, and OIDC claims on the Hono context.
 *
 * Unauthenticated requests default to 'free' tier.
 *
 * Uses createMiddleware() from hono/factory for type-safe context variables.
 */
export const apiKeyAuth = createMiddleware<AppEnv>(async (c, next) => {
  // Default to free tier, unauthenticated
  c.set('tier', 'free');
  c.set('keyName', null);
  c.set('isAuthenticated', false);
  c.set('oidcClaims', null);

  const authHeader = c.req.header('Authorization');

  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);

    // ── OIDC JWT (GitHub Actions) ───────────────────────────────────
    // JWTs start with eyJ (base64url for {"alg":..., "typ":"JWT"...})
    if (token.startsWith('eyJ')) {
      try {
        const claims = await verifyOidcToken(token, c.env);

        // Only public repos get free OIDC quota — private repos upsell (ADR-006)
        if (claims.repository_visibility !== 'public') {
          return c.json({
            error: 'IsItAlive OIDC auth is free for open-source only.',
            repository_visibility: claims.repository_visibility,
            hint: 'To secure private corporate repositories, get a Pro API key at https://isitalive.dev/pricing and add it as an ISITALIVE_API_KEY GitHub Secret.',
          }, 401);
        }

        c.set('tier', 'free');
        c.set('keyName', `oidc:${claims.repository}`);
        c.set('isAuthenticated', true);
        c.set('oidcClaims', claims);
        return next();
      } catch (err) {
        // OIDC verification failed — log for observability, fall through
        // to unauthenticated. Don't return 401 here since the token
        // could be legitimately malformed (not a real OIDC attempt).
        console.warn('OIDC verification failed:', err instanceof Error ? err.message : err)
      }
      return next();
    }

    // ── API key (existing flow) ─────────────────────────────────────
    const entry = await c.env.KEYS_KV.get(token, 'json') as ApiKeyEntry | null;

    if (entry && entry.active !== false) {
      c.set('tier', (entry.tier || 'free') as Tier);
      c.set('keyName', entry.name || 'unnamed');
      c.set('isAuthenticated', true);
    }
    // Invalid/inactive keys silently fall through to free tier —
    // doesn't reveal whether a key exists (OSS-safe)
  }

  return next();
});
