// ---------------------------------------------------------------------------
// API key + OIDC authentication middleware — D1-backed
//
// Two auth strategies (in priority order):
//   1. API key:  Authorization: Bearer sk_abc123   → D1 lookup in api_keys
//   2. OIDC JWT: Authorization: Bearer eyJ...      → GitHub Actions OIDC verification
//   3. No auth:                                    → free access, unauthenticated
//
// Keys are stored in D1 and managed by the admin UI:
//   Key:   sk_abc123
//   Value: { "tier": "free", "name": "ACME Corp", "active": true, "created": "2026-03-19" }
//
// OIDC tokens are verified against GitHub's JWKS (see ../github/oidc.ts).
// Public repos get free OIDC auth; private repo OIDC tokens get 401.
//
// OSS-safe: actual API key values only exist in KV, never in code.
// ---------------------------------------------------------------------------

import { createMiddleware } from 'hono/factory';
import type { Env } from '../types/env';
import type { Tier } from '../cache/index';
import { verifyOidcToken, type OidcClaims } from '../github/oidc';
import { getApiKey } from '../db/state';

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

        // Only public repositories can use GitHub Actions OIDC directly.
        if (claims.repository_visibility !== 'public') {
          return c.json({
            error: 'IsItAlive OIDC auth is available for public repositories only.',
            repository_visibility: claims.repository_visibility,
            hint: 'For private repository CI, use an authenticated IsItAlive API key as an ISITALIVE_API_KEY GitHub Secret.',
          }, 401);
        }

        c.set('tier', 'free');
        c.set('keyName', `oidc:${claims.repository}`);
        c.set('isAuthenticated', true);
        c.set('oidcClaims', claims);
        return next();
      } catch (err) {
        // OIDC verification failed — return 401 with clear error so
        // legitimate OIDC users get feedback instead of a silent downgrade.
        const message = err instanceof Error ? err.message : 'Verification failed'
        return c.json({
          error: 'OIDC token verification failed',
          detail: message,
          hint: 'Ensure your workflow has `permissions: { id-token: write }` and the token audience is https://isitalive.dev',
        }, 401);
      }
    }

    // ── API key (existing flow) ─────────────────────────────────────
    const entry = await getApiKey(c.env, token);

    if (entry && entry.active !== false) {
      c.set('tier', 'free');
      c.set('keyName', entry.name || 'unnamed');
      c.set('isAuthenticated', true);
    }
    // Invalid/inactive keys silently fall through to free tier —
    // doesn't reveal whether a key exists (OSS-safe)
  }

  return next();
});
