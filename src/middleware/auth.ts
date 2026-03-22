// ---------------------------------------------------------------------------
// API key authentication middleware — KV-backed
//
// Keys are stored in the KEYS_KV namespace, managed via CF dashboard:
//
//   Key:   sk_abc123
//   Value: { "tier": "pro", "name": "ACME Corp", "active": true, "created": "2026-03-19" }
//
// To add a key: go to Workers & Pages → KV → KEYS_KV → Add entry
// To revoke:   set "active": false or delete the key
//
// OSS-safe: actual API key values only exist in KV, never in code.
// ---------------------------------------------------------------------------

import { Context, Next } from 'hono';
import type { Env, ApiKeyEntry } from '../scoring/types';
import type { Tier } from '../cache/index';

type AppEnv = { Bindings: Env; Variables: { tier: Tier; keyName: string | null; isAuthenticated: boolean } };

/**
 * API key auth — looks up Bearer token in KV and sets tier + key name.
 * Unauthenticated requests default to 'free' tier.
 */
export async function apiKeyAuth(c: Context<AppEnv>, next: Next) {
  // Default to free tier, unauthenticated
  c.set('tier', 'free');
  c.set('keyName', null);
  c.set('isAuthenticated', false);

  const authHeader = c.req.header('Authorization');

  if (authHeader?.startsWith('Bearer ')) {
    const key = authHeader.slice(7);

    // Look up the key in KV
    const entry = await c.env.KEYS_KV.get(key, 'json') as ApiKeyEntry | null;

    if (entry && entry.active !== false) {
      c.set('tier', (entry.tier || 'free') as Tier);
      c.set('keyName', entry.name || 'unnamed');
      c.set('isAuthenticated', true);
    }
    // Invalid/inactive keys silently fall through to free tier —
    // doesn't reveal whether a key exists (OSS-safe)
  }

  return next();
}
