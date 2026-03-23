// ---------------------------------------------------------------------------
// GitHub Actions OIDC token verification
//
// Verifies JWT tokens issued by GitHub Actions' OIDC provider using Hono's
// built-in JWT helpers. Tokens are verified against GitHub's JWKS endpoint
// with RS256 signature validation and standard claim checks (exp, nbf, iss, aud).
// ---------------------------------------------------------------------------

import { verifyWithJwks } from 'hono/jwt'
import type { JWTPayload } from 'hono/utils/jwt/types'
import type { HonoJsonWebKey } from 'hono/utils/jwt/jws'
import type { Env } from '../types/env'

const GITHUB_OIDC_ISSUER = 'https://token.actions.githubusercontent.com'
const GITHUB_JWKS_URI = 'https://token.actions.githubusercontent.com/.well-known/jwks.json'
const EXPECTED_AUDIENCE = 'https://isitalive.dev'

// KV cache key for JWKS (used as pre-loaded keys to avoid network round-trip)
const JWKS_CACHE_KEY = 'github:oidc:jwks'

/** Required OIDC claims beyond the standard JWT fields */
const REQUIRED_CLAIMS = [
  'repository',
  'repository_visibility',
  'repository_owner',
] as const

/** Typed result of a successfully verified OIDC token */
export interface OidcClaims {
  repository: string
  repository_visibility: string
  repository_owner: string
  run_id?: string
  actor?: string
}

/** Verification options shared by both cached and remote JWKS paths */
const VERIFY_OPTIONS = {
  allowedAlgorithms: ['RS256'] as const,
  verification: {
    iss: GITHUB_OIDC_ISSUER,
    aud: EXPECTED_AUDIENCE,
  },
} as const

/**
 * Extract OIDC-specific claims from the verified JWT payload.
 * Throws if any required claim is missing.
 */
function extractClaims(payload: JWTPayload): OidcClaims {
  for (const claim of REQUIRED_CLAIMS) {
    if (!Object.hasOwn(payload, claim) || typeof payload[claim] !== 'string') {
      throw new Error(`Missing required OIDC claim: ${claim}`)
    }
  }

  return {
    repository: payload.repository as string,
    repository_visibility: payload.repository_visibility as string,
    repository_owner: payload.repository_owner as string,
    run_id: typeof payload.run_id === 'string' ? payload.run_id : undefined,
    actor: typeof payload.actor === 'string' ? payload.actor : undefined,
  }
}

/**
 * Try to load cached JWKS keys from KV.
 * Returns undefined if no cached keys are available.
 */
async function getCachedJwks(env: Env): Promise<HonoJsonWebKey[] | undefined> {
  try {
    const raw = await env.CACHE_KV.get(JWKS_CACHE_KEY)
    if (!raw) return undefined
    const parsed = JSON.parse(raw)
    if (parsed?.keys && Array.isArray(parsed.keys)) {
      return parsed.keys as HonoJsonWebKey[]
    }
    return undefined
  } catch {
    return undefined
  }
}

/**
 * Map Hono JWT error messages to our domain errors for backward compat.
 */
function mapError(err: any): Error {
  const message = err.message || String(err)

  if (message.includes('expired') || err.name === 'JwtTokenExpired') {
    return new Error('Token expired')
  }
  if (message.includes('not before') || err.name === 'JwtTokenNotBefore') {
    return new Error('Token not yet valid (nbf)')
  }
  if (message.includes('issuer') || err.name === 'JwtTokenIssuer') {
    return new Error('Invalid issuer')
  }
  if (message.includes('audience')) {
    return new Error('Invalid audience')
  }
  if (message.includes('signature') || err.name === 'JwtTokenSignatureMismatched') {
    return new Error('Invalid signature')
  }
  if (message.includes('kid') && !message.includes('key')) {
    return new Error('No matching key found in JWKS')
  }

  return err
}

/**
 * Verify a GitHub Actions OIDC token and extract claims.
 *
 * Two-pass verification strategy:
 * 1. Try with cached JWKS keys from KV (fast path, no network)
 * 2. If kid not found in cache, fetch from GitHub's JWKS endpoint
 *
 * Hono's verifyWithJwks() handles:
 * - Key selection by kid
 * - RS256 signature verification
 * - Standard claim validation (exp, nbf, iat, iss, aud)
 */
export async function verifyOidcToken(token: string, env: Env): Promise<OidcClaims> {
  const cachedKeys = await getCachedJwks(env)

  let payload: JWTPayload | undefined

  // ── Pass 1: Try cached keys (no network) ──────────────────────────
  if (cachedKeys && cachedKeys.length > 0) {
    try {
      payload = await verifyWithJwks(token, {
        keys: cachedKeys,
        ...VERIFY_OPTIONS,
      })
    } catch (err: any) {
      // If the error is "kid not found" or "invalid token" (no matching key),
      // fall through to pass 2. All other errors (expired, bad sig) are real.
      const message = err.message || String(err)
      const isKeyMissing = err.name === 'JwtTokenInvalid'
        && !message.includes('expired')
        && !message.includes('signature')
        && !message.includes('issuer')
        && !message.includes('audience')
        && !message.includes('not before')

      if (!isKeyMissing) {
        throw mapError(err)
      }
      // Fall through to pass 2 for JWKS refetch
    }
  }

  // ── Pass 2: Fetch JWKS from GitHub (network) ─────────────────────
  if (!payload) {
    try {
      payload = await verifyWithJwks(token, {
        jwks_uri: GITHUB_JWKS_URI,
        ...VERIFY_OPTIONS,
      })

      // Cache the freshly-fetched JWKS keys (best-effort)
      try {
        const res = await fetch(GITHUB_JWKS_URI)
        if (res.ok) {
          await env.CACHE_KV.put(JWKS_CACHE_KEY, await res.text())
        }
      } catch {
        // Caching is best-effort
      }
    } catch (err: any) {
      const message = err.message || String(err)

      if (message.includes('key') || message.includes('kid') || err.name === 'JwtTokenInvalid') {
        throw new Error('No matching key found in JWKS')
      }
      throw mapError(err)
    }
  }

  return extractClaims(payload)
}
