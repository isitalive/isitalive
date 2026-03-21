// ---------------------------------------------------------------------------
// Admin authentication middleware — session-based with HMAC-signed cookies
//
// Auth flow:
//   1. Admin visits /admin/auth/login → sees login form
//   2. Enters ADMIN_SECRET (from CF dashboard secrets or build logs)
//   3. Server validates, sets HttpOnly session cookie (HMAC-signed)
//   4. All /admin/* routes check the session cookie
//
// Preview envs: ADMIN_SECRET is output to build logs so deployers
// can authenticate on preview origins without dashboard access.
//
// Future: replace with WebAuthn/Passkey registration + assertion
// (issue #8 — passkeys require HTTPS origins, so session auth
// bridges the gap for local dev and preview envs).
// ---------------------------------------------------------------------------

import { Context, Next } from 'hono'
import type { Env } from '../types/env'
import { timingSafeEqual } from '../utils/crypto'

type AdminEnv = { Bindings: Env }

const SESSION_COOKIE = 'iad_session'
const SESSION_TTL_S = 86400 * 7 // 7 days

/**
 * Sign a payload with HMAC-SHA256 using a secret key.
 */
async function hmacSign(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload))
  return btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * Verify an HMAC-SHA256 signature.
 */
async function hmacVerify(payload: string, signature: string, secret: string): Promise<boolean> {
  const expected = await hmacSign(payload, secret)
  return timingSafeEqual(expected, signature)
}

/**
 * Create a signed session cookie value.
 */
export async function createSession(secret: string): Promise<{ cookie: string; maxAge: number }> {
  const expiresAt = Date.now() + SESSION_TTL_S * 1000
  const payload = `admin:${expiresAt}`
  const sig = await hmacSign(payload, secret)
  return {
    cookie: `${payload}.${sig}`,
    maxAge: SESSION_TTL_S,
  }
}

/**
 * Validate a session cookie value.
 */
export async function validateSession(cookie: string, secret: string): Promise<boolean> {
  const lastDot = cookie.lastIndexOf('.')
  if (lastDot === -1) return false

  const payload = cookie.slice(0, lastDot)
  const sig = cookie.slice(lastDot + 1)

  if (!await hmacVerify(payload, sig, secret)) return false

  // Check expiry
  const parts = payload.split(':')
  if (parts.length !== 2) return false
  const expiresAt = parseInt(parts[1], 10)
  if (isNaN(expiresAt) || Date.now() > expiresAt) return false

  return true
}

/**
 * Parse cookies from a Cookie header string.
 */
function parseCookies(header: string): Record<string, string> {
  const cookies: Record<string, string> = {}
  for (const pair of header.split(';')) {
    const [name, ...rest] = pair.trim().split('=')
    if (name) cookies[name.trim()] = rest.join('=').trim()
  }
  return cookies
}

/**
 * Admin auth guard — checks session cookie on all admin routes.
 * If ADMIN_SECRET is not configured, admin access is disabled entirely.
 */
export async function adminAuth(c: Context<AdminEnv>, next: Next) {
  const secret = c.env.ADMIN_SECRET

  // No admin secret configured — admin section is disabled
  if (!secret) {
    return c.json({ error: 'Admin section is not configured' }, 503)
  }

  // Check session cookie
  const cookieHeader = c.req.header('Cookie') || ''
  const cookies = parseCookies(cookieHeader)
  const session = cookies[SESSION_COOKIE]

  if (session && await validateSession(session, secret)) {
    return next()
  }

  // Not authenticated — return 401 for API paths, redirect for pages
  const path = new URL(c.req.url).pathname
  if (path.startsWith('/admin/api/')) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  return c.redirect('/admin/auth/login')
}

/**
 * Build a Set-Cookie header for the admin session.
 * Secure attribute is omitted when running over HTTP (local dev).
 */
export function sessionCookieHeader(cookie: string, maxAge: number, isSecure = true): string {
  const secure = isSecure ? '; Secure' : ''
  return `${SESSION_COOKIE}=${cookie}; Path=/admin; HttpOnly${secure}; SameSite=Strict; Max-Age=${maxAge}`
}

/**
 * Build a Set-Cookie header that clears the admin session.
 */
export function clearSessionCookieHeader(isSecure = true): string {
  const secure = isSecure ? '; Secure' : ''
  return `${SESSION_COOKIE}=; Path=/admin; HttpOnly${secure}; SameSite=Strict; Max-Age=0`
}
