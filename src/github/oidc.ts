// ---------------------------------------------------------------------------
// GitHub Actions OIDC token verification
//
// Verifies JWT tokens issued by GitHub Actions' OIDC provider using Hono's
// built-in JWT helpers. Tokens are verified against GitHub's JWKS endpoint
// with RS256 signature validation and standard claim checks (exp, nbf, iss, aud).
// ---------------------------------------------------------------------------

import { verifyWithJwks, decode } from 'hono/jwt'
import type { Env } from '../types/env'

// Local minimal types — avoids relying on Hono's internal hono/utils/jwt/* paths
export interface JWTPayload {
  [claim: string]: unknown
}

export interface HonoJsonWebKey {
  kid?: string
  kty: string
  alg?: string
  use?: string
  n?: string
  e?: string
  [prop: string]: unknown
}

const GITHUB_OIDC_ISSUER = 'https://token.actions.githubusercontent.com'
const GITHUB_JWKS_URI = 'https://token.actions.githubusercontent.com/.well-known/jwks'
const EXPECTED_AUDIENCE = 'https://isitalive.dev'

// KV cache key for JWKS (used as pre-loaded keys to avoid network round-trip)
const JWKS_CACHE_KEY = 'github:oidc:jwks'

// KV cooldown key — prevents repeated JWKS refetches on unknown kids
const JWKS_REFETCH_COOLDOWN_KEY = 'github:oidc:jwks:cooldown'
const JWKS_REFETCH_COOLDOWN_S = 60 // At most one refetch per 60 seconds

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
 * Safely extract the kid from a JWT header without full verification.
 * Returns undefined if the token is malformed.
 */
function extractKid(token: string): string | undefined {
  try {
    const { header } = decode(token)
    return header.kid
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
 * Strategy:
 * 1. Decode JWT header to extract kid (rejects malformed tokens early)
 * 2. Try verification with cached JWKS keys from KV (fast path, no network)
 * 3. If kid not in cache, fetch JWKS from GitHub (rate-limited by cooldown)
 *
 * Hono's verifyWithJwks() handles:
 * - Key selection by kid
 * - RS256 signature verification
 * - Standard claim validation (exp, nbf, iat, iss, aud)
 */
export async function verifyOidcToken(token: string, env: Env): Promise<OidcClaims> {
  // Pre-decode header to extract kid — rejects garbage tokens before any JWKS work
  const kid = extractKid(token)
  if (!kid) {
    throw new Error('OIDC verification failed: missing or invalid JWT header (no kid)')
  }

  const cachedKeys = await getCachedJwks(env)

  // ── Pass 1: Try cached keys (no network) ──────────────────────────
  if (cachedKeys && cachedKeys.length > 0) {
    // Check if kid exists in cache before calling verifyWithJwks
    const kidInCache = cachedKeys.some(k => k.kid === kid)

    if (kidInCache) {
      try {
        const payload = await verifyWithJwks(token, {
          keys: cachedKeys,
          ...VERIFY_OPTIONS,
        })
        return extractClaims(payload)
      } catch (err: any) {
        // Real verification errors (expired, bad sig, wrong issuer) — don't retry
        throw mapError(err)
      }
    }
    // kid not in cache — fall through to pass 2
  }

  // ── Pass 2: Fetch JWKS from GitHub (network, rate-limited) ────────
  // Cooldown check: prevent repeated fetches from attacker-controlled kid values
  const cooldown = await env.CACHE_KV.get(JWKS_REFETCH_COOLDOWN_KEY)
  if (cooldown) {
    throw new Error('No matching key found in JWKS')
  }

  try {
    // Set cooldown before fetching (prevents parallel stampede)
    await env.CACHE_KV.put(JWKS_REFETCH_COOLDOWN_KEY, '1', { expirationTtl: JWKS_REFETCH_COOLDOWN_S })

    const res = await fetch(GITHUB_JWKS_URI)
    if (!res.ok) {
      throw new Error(`Failed to fetch JWKS: ${res.status} ${res.statusText}`)
    }

    const jwksText = await res.text()
    let keys: HonoJsonWebKey[]
    try {
      const parsed = JSON.parse(jwksText) as { keys?: HonoJsonWebKey[] }
      keys = parsed.keys ?? []
    } catch {
      throw new Error('Failed to parse JWKS JSON')
    }

    // Cache the freshly-fetched JWKS keys (best-effort, 1h TTL)
    try {
      await env.CACHE_KV.put(JWKS_CACHE_KEY, jwksText, { expirationTtl: 3600 })
    } catch {
      // Caching is best-effort
    }

    const payload = await verifyWithJwks(token, {
      keys,
      ...VERIFY_OPTIONS,
    })

    return extractClaims(payload)
  } catch (err: any) {
    const message = (err.message || String(err)).toLowerCase()

    // Narrow to key-not-found conditions only
    const isKeyNotFoundError =
      (message.includes('kid') && message.includes('not found')) ||
      message.includes('no matching key') ||
      (message.includes('jwks') && message.includes('key')) ||
      message.includes('invalid jwt token') // Hono throws this when no key matches kid

    if (isKeyNotFoundError) {
      throw new Error('No matching key found in JWKS')
    }
    throw mapError(err)
  }
}
