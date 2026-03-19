// ---------------------------------------------------------------------------
// API key authentication middleware — tiered access
//
// Keys are stored as a JSON object in the API_KEYS secret:
// {
//   "sk_abc123": { "tier": "free", "name": "My Bot" },
//   "sk_xyz789": { "tier": "pro",  "name": "CI Pipeline" },
//   "sk_ent001": { "tier": "enterprise", "name": "ACME Corp" }
// }
//
// OSS-safe: the actual keys live in CF secrets, not in code.
// ---------------------------------------------------------------------------

import { Context, Next } from 'hono';
import type { Env } from '../scoring/types';
import type { Tier } from '../cache/index';

interface ApiKeyEntry {
  tier: Tier;
  name: string;
}

type ApiKeyStore = Record<string, ApiKeyEntry>;

type AppEnv = { Bindings: Env; Variables: { tier: Tier; keyName: string | null } };

/**
 * API key auth — checks Bearer token and sets tier + key name.
 * Unauthenticated requests default to 'free' tier.
 */
export async function apiKeyAuth(c: Context<AppEnv>, next: Next) {
  // Default to free tier
  c.set('tier', 'free');
  c.set('keyName', null);

  const authHeader = c.req.header('Authorization');

  if (authHeader?.startsWith('Bearer ')) {
    const key = authHeader.slice(7);
    const store = parseApiKeys(c.env.API_KEYS);
    const entry = store[key];

    if (entry) {
      c.set('tier', entry.tier);
      c.set('keyName', entry.name);
    }
    // Invalid keys silently fall through to free tier —
    // don't reveal whether a key exists or not (OSS-safe)
  }

  return next();
}

function parseApiKeys(raw?: string): ApiKeyStore {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}
