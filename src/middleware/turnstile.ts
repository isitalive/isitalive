// ---------------------------------------------------------------------------
// Cloudflare Turnstile verification — server-side token validation
//
// The widget runs client-side on the search form and produces a token.
// This middleware verifies that token with Cloudflare's siteverify API
// before allowing the request through to the result page.
//
// OSS-safe: the secret key lives in CF env, never in code.
// ---------------------------------------------------------------------------

import { Context, Next } from 'hono';
import type { Env } from '../scoring/types';

const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

type AppEnv = { Bindings: Env; Variables: { parsedBody?: Record<string, string> } };

/**
 * Verify a Turnstile token from the request.
 * Only applied to web UI form submissions, NOT the API.
 *
 * If TURNSTILE_SECRET_KEY is not configured, verification is skipped
 * (allows running locally without Turnstile set up).
 *
 * NOTE: This middleware parses the request body and stores it in context
 * via c.set('parsedBody', ...) so downstream handlers can access it
 * without double-parsing (the body stream can only be read once).
 */
export async function verifyTurnstile(
  c: Context<AppEnv>,
  next: Next,
) {
  const secretKey = c.env.TURNSTILE_SECRET_KEY;

  // Parse body once and store for downstream handlers
  const body = await c.req.parseBody().catch(() => ({})) as Record<string, string>;
  (c as any).set('parsedBody', body);

  // Skip if Turnstile not configured (local dev, staging)
  if (!secretKey) {
    return next();
  }

  const token = c.req.query('cf-turnstile-response') ?? body['cf-turnstile-response'];

  if (!token) {
    return c.html(errorHtml('Please complete the verification challenge.'), 403);
  }

  // Server-side verification with Cloudflare
  const ip = c.req.header('cf-connecting-ip') ?? '';
  const res = await fetch(TURNSTILE_VERIFY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      secret: secretKey,
      response: token,
      remoteip: ip,
    }),
  });

  const outcome = await res.json() as { success: boolean; 'error-codes'?: string[] };

  if (!outcome.success) {
    return c.html(errorHtml('Verification failed. Please try again.'), 403);
  }

  return next();
}

import { escapeHtml } from '../utils/html'

function errorHtml(message: string): string {
  const safe = escapeHtml(message)
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Verification Required — Is It Alive?</title>
<style>body{font-family:Inter,sans-serif;background:#0a0a0f;color:#e8e8ed;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}
.card{text-align:center;max-width:400px;padding:40px}.icon{font-size:3rem;margin-bottom:16px}h1{font-size:1.2rem;margin-bottom:12px}
p{color:#8b8b9e;font-size:.9rem;margin-bottom:24px}a{background:#6366f1;color:#fff;text-decoration:none;padding:12px 28px;border-radius:12px;font-weight:600}</style>
</head><body><div class="card"><div class="icon">🛡️</div><h1>${safe}</h1>
<p>This helps us protect the service from automated abuse.</p><a href="/">← Back to search</a></div></body></html>`;
}
