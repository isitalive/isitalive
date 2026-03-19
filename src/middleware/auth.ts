// ---------------------------------------------------------------------------
// API key authentication middleware
// ---------------------------------------------------------------------------

import { Context, Next } from 'hono';
import type { Env } from '../scoring/types';

type AppEnv = { Bindings: Env; Variables: { isPaid: boolean } };

/**
 * Optional API key auth — if a valid Bearer token is present, mark as paid.
 * Does NOT reject unauthenticated requests (they fall through to free tier).
 */
export async function apiKeyAuth(c: Context<AppEnv>, next: Next) {
  const authHeader = c.req.header('Authorization');

  if (authHeader?.startsWith('Bearer ')) {
    const key = authHeader.slice(7);
    const validKeys = parseApiKeys(c.env.API_KEYS);

    if (validKeys.includes(key)) {
      c.set('isPaid', true);
    }
  }

  return next();
}

function parseApiKeys(raw?: string): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
