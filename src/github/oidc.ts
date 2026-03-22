// ---------------------------------------------------------------------------
// GitHub Actions OIDC — JWT verification
//
// Validates OIDC tokens issued by GitHub Actions for zero-config CI auth.
// Uses Web Crypto API (no external JWT library) — same pattern as verify.ts.
//
// Flow:
//   1. Decode JWT header → extract `kid`
//   2. Fetch JWKS from GitHub's OIDC issuer (cached in KV, 1h TTL)
//   3. If KID not in cache → refetch JWKS once (handles key rotation)
//   4. Import RSA public key → verify RS256 signature
//   5. Validate claims (iss, aud, exp, nbf)
//   6. Extract repository claims for quota tracking
//
// Ref: https://docs.github.com/en/actions/security-for-github-actions/security-hardening-your-deployments/about-security-hardening-with-openid-connect
// ---------------------------------------------------------------------------

import type { Env } from '../scoring/types'

const GITHUB_OIDC_ISSUER = 'https://token.actions.githubusercontent.com'
const JWKS_URL = `${GITHUB_OIDC_ISSUER}/.well-known/jwks`
const JWKS_CACHE_KEY = 'github:oidc:jwks'
const JWKS_CACHE_TTL = 3600 // 1 hour
const EXPECTED_AUDIENCE = 'https://isitalive.dev'
const CLOCK_SKEW_SECONDS = 60 // tolerance for clock drift

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Verified claims extracted from a GitHub Actions OIDC token */
export interface OidcClaims {
  /** Full repository name, e.g. "vercel/next.js" */
  repository: string
  /** Repository visibility: "public" | "private" | "internal" */
  repository_visibility: string
  /** Repository owner, e.g. "vercel" */
  repository_owner: string
  /** Workflow run ID */
  run_id: string
  /** Actor who triggered the workflow */
  actor: string
  /** Full subject claim */
  sub: string
}

// ---------------------------------------------------------------------------
// JWKS types
// ---------------------------------------------------------------------------

interface JwkKey {
  kty: string
  kid: string
  alg: string
  n: string
  e: string
  use?: string
}

interface JwksResponse {
  keys: JwkKey[]
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Verify a GitHub Actions OIDC JWT and return extracted claims.
 *
 * @throws Error if the token is invalid, expired, or has wrong issuer/audience
 */
export async function verifyOidcToken(jwt: string, env: Env): Promise<OidcClaims> {
  // ── 1. Decode header and payload (without verification yet) ─────────
  const parts = jwt.split('.')
  if (parts.length !== 3) {
    throw new Error('Invalid JWT: expected 3 parts')
  }

  const header = JSON.parse(base64urlDecode(parts[0]))
  const payload = JSON.parse(base64urlDecode(parts[1]))

  if (header.alg !== 'RS256') {
    throw new Error(`Unsupported algorithm: ${header.alg}`)
  }

  if (!header.kid) {
    throw new Error('Missing kid in JWT header')
  }

  // ── 2. Find matching key in JWKS ────────────────────────────────────
  let jwk = await findJwk(env, header.kid, false)

  // If KID not found, refetch JWKS once (handles key rotation)
  if (!jwk) {
    jwk = await findJwk(env, header.kid, true)
  }

  if (!jwk) {
    throw new Error(`No matching key found for kid: ${header.kid}`)
  }

  // ── 3. Import public key and verify signature ───────────────────────
  const publicKey = await crypto.subtle.importKey(
    'jwk',
    { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256' },
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify'],
  )

  const signingInput = new TextEncoder().encode(`${parts[0]}.${parts[1]}`)
  const signature = base64urlToBuffer(parts[2])

  const valid = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    publicKey,
    signature,
    signingInput,
  )

  if (!valid) {
    throw new Error('Invalid JWT signature')
  }

  // ── 4. Validate standard claims ─────────────────────────────────────
  validateClaims(payload)

  // ── 5. Extract and return OIDC-specific claims ──────────────────────
  return extractClaims(payload)
}

// ---------------------------------------------------------------------------
// JWKS fetching (with KV cache)
// ---------------------------------------------------------------------------

/**
 * Find a JWK by key ID, using KV cache. If `forceRefresh` is true,
 * bypasses the cache and fetches fresh JWKS from GitHub.
 */
async function findJwk(
  env: Env,
  kid: string,
  forceRefresh: boolean,
): Promise<JwkKey | null> {
  const jwks = await fetchJwks(env, forceRefresh)
  return jwks.keys.find((k) => k.kid === kid) ?? null
}

/**
 * Fetch GitHub's OIDC JWKS, caching in KV for efficiency.
 * Set `forceRefresh` to bypass cache (e.g. on unknown KID).
 */
export async function fetchJwks(
  env: Env,
  forceRefresh = false,
): Promise<JwksResponse> {
  // Try cache first (unless forced)
  if (!forceRefresh) {
    const cached = await env.CACHE_KV.get(JWKS_CACHE_KEY)
    if (cached) {
      return JSON.parse(cached) as JwksResponse
    }
  }

  // Fetch fresh JWKS
  const response = await fetch(JWKS_URL, {
    headers: { Accept: 'application/json' },
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch JWKS: ${response.status} ${response.statusText}`)
  }

  const jwks = (await response.json()) as JwksResponse

  if (!jwks.keys || jwks.keys.length === 0) {
    throw new Error('JWKS response contains no keys')
  }

  // Cache in KV
  await env.CACHE_KV.put(JWKS_CACHE_KEY, JSON.stringify(jwks), {
    expirationTtl: JWKS_CACHE_TTL,
  })

  return jwks
}

// ---------------------------------------------------------------------------
// Claim validation
// ---------------------------------------------------------------------------

function validateClaims(payload: any): void {
  const now = Math.floor(Date.now() / 1000)

  // Issuer
  if (payload.iss !== GITHUB_OIDC_ISSUER) {
    throw new Error(`Invalid issuer: ${payload.iss}`)
  }

  // Audience
  if (payload.aud !== EXPECTED_AUDIENCE) {
    throw new Error(`Invalid audience: ${payload.aud}`)
  }

  // Expiration
  if (typeof payload.exp !== 'number' || now > payload.exp + CLOCK_SKEW_SECONDS) {
    throw new Error('Token has expired')
  }

  // Not before
  if (typeof payload.nbf === 'number' && now < payload.nbf - CLOCK_SKEW_SECONDS) {
    throw new Error('Token is not yet valid')
  }
}

function extractClaims(payload: any): OidcClaims {
  const required = ['repository', 'repository_visibility', 'repository_owner']
  for (const field of required) {
    if (!payload[field]) {
      throw new Error(`Missing required OIDC claim: ${field}`)
    }
  }

  return {
    repository: payload.repository,
    repository_visibility: payload.repository_visibility,
    repository_owner: payload.repository_owner,
    run_id: String(payload.run_id ?? ''),
    actor: payload.actor ?? '',
    sub: payload.sub ?? '',
  }
}

// ---------------------------------------------------------------------------
// Base64url helpers
// ---------------------------------------------------------------------------

/** Decode a base64url string to a UTF-8 string */
function base64urlDecode(str: string): string {
  // Restore standard base64
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
  return atob(padded)
}

/** Decode a base64url string to an ArrayBuffer (for signature verification) */
function base64urlToBuffer(str: string): ArrayBuffer {
  const binary = base64urlDecode(str)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes.buffer as ArrayBuffer
}
