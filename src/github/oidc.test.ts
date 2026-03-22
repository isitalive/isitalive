import { describe, expect, it, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Test helpers — build JWTs with known keys for verification testing
// ---------------------------------------------------------------------------

/** Generate an RSA key pair for testing */
async function generateTestKeyPair(): Promise<CryptoKeyPair> {
  const keyPair = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  ) as CryptoKeyPair
  return keyPair
}

/** Export public key as JWK */
async function exportPublicJwk(key: CryptoKey, kid: string) {
  const jwk = await crypto.subtle.exportKey('jwk', key)
  return { ...jwk, kid, alg: 'RS256', use: 'sig' }
}

/** Base64url encode a string */
function base64url(str: string): string {
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** Base64url encode a buffer */
function base64urlFromBuffer(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** Build a signed JWT with the given payload and private key */
async function buildJwt(
  payload: Record<string, unknown>,
  privateKey: CryptoKey,
  kid: string,
  alg = 'RS256',
): Promise<string> {
  const header = base64url(JSON.stringify({ alg, typ: 'JWT', kid }))
  const body = base64url(JSON.stringify(payload))
  const signingInput = `${header}.${body}`

  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    privateKey,
    new TextEncoder().encode(signingInput),
  )

  return `${signingInput}.${base64urlFromBuffer(signature)}`
}

/** Standard valid claims for a public repo */
function validClaims(overrides: Record<string, unknown> = {}) {
  const now = Math.floor(Date.now() / 1000)
  return {
    iss: 'https://token.actions.githubusercontent.com',
    aud: 'https://isitalive.dev',
    exp: now + 600,
    nbf: now - 10,
    iat: now,
    sub: 'repo:vercel/next.js:ref:refs/heads/main',
    repository: 'vercel/next.js',
    repository_visibility: 'public',
    repository_owner: 'vercel',
    run_id: '12345',
    actor: 'dependabot[bot]',
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Mock environment
// ---------------------------------------------------------------------------

function createMockEnv(jwksJson: string | null = null) {
  const kvStore = new Map<string, string>()
  if (jwksJson) {
    kvStore.set('github:oidc:jwks', jwksJson)
  }

  return {
    CACHE_KV: {
      get: vi.fn(async (key: string) => kvStore.get(key) ?? null),
      put: vi.fn(async (key: string, value: string) => { kvStore.set(key, value) }),
    },
    // Other env bindings are not needed for OIDC tests
  } as any
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

// Mock global fetch for JWKS endpoint
const originalFetch = globalThis.fetch

describe('verifyOidcToken', () => {
  let keyPair: CryptoKeyPair
  let publicJwk: any
  let jwksResponse: string

  beforeEach(async () => {
    keyPair = await generateTestKeyPair()
    publicJwk = await exportPublicJwk(keyPair.publicKey, 'test-kid-1')
    jwksResponse = JSON.stringify({ keys: [publicJwk] })

    // Reset fetch mock
    globalThis.fetch = originalFetch
  })

  // Dynamically import to pick up fresh mocks
  async function getVerifier() {
    return await import('./oidc')
  }

  it('accepts a valid OIDC token for a public repo', async () => {
    const { verifyOidcToken } = await getVerifier()
    const env = createMockEnv(jwksResponse)

    const jwt = await buildJwt(validClaims(), keyPair.privateKey, 'test-kid-1')
    const claims = await verifyOidcToken(jwt, env)

    expect(claims.repository).toBe('vercel/next.js')
    expect(claims.repository_visibility).toBe('public')
    expect(claims.repository_owner).toBe('vercel')
    expect(claims.run_id).toBe('12345')
    expect(claims.actor).toBe('dependabot[bot]')
  })

  it('rejects an expired token', async () => {
    const { verifyOidcToken } = await getVerifier()
    const env = createMockEnv(jwksResponse)

    const jwt = await buildJwt(
      validClaims({ exp: Math.floor(Date.now() / 1000) - 120 }),
      keyPair.privateKey,
      'test-kid-1',
    )

    await expect(verifyOidcToken(jwt, env)).rejects.toThrow('expired')
  })

  it('rejects a token with wrong issuer', async () => {
    const { verifyOidcToken } = await getVerifier()
    const env = createMockEnv(jwksResponse)

    const jwt = await buildJwt(
      validClaims({ iss: 'https://evil.example.com' }),
      keyPair.privateKey,
      'test-kid-1',
    )

    await expect(verifyOidcToken(jwt, env)).rejects.toThrow('issuer')
  })

  it('rejects a token with wrong audience', async () => {
    const { verifyOidcToken } = await getVerifier()
    const env = createMockEnv(jwksResponse)

    const jwt = await buildJwt(
      validClaims({ aud: 'https://wrong.example.com' }),
      keyPair.privateKey,
      'test-kid-1',
    )

    await expect(verifyOidcToken(jwt, env)).rejects.toThrow('audience')
  })

  it('rejects a token signed with a different key', async () => {
    const { verifyOidcToken } = await getVerifier()
    const env = createMockEnv(jwksResponse)

    // Generate a different key pair
    const otherKeyPair = await generateTestKeyPair()
    const jwt = await buildJwt(validClaims(), otherKeyPair.privateKey, 'test-kid-1')

    await expect(verifyOidcToken(jwt, env)).rejects.toThrow('signature')
  })

  it('refetches JWKS when kid is not in cache', async () => {
    const { verifyOidcToken } = await getVerifier()

    // Cache has an old key set (different kid)
    const oldJwks = JSON.stringify({ keys: [{ ...publicJwk, kid: 'old-kid' }] })
    const env = createMockEnv(oldJwks)

    // Mock fetch to return the current key set
    globalThis.fetch = vi.fn(async () =>
      new Response(jwksResponse, { status: 200 }),
    ) as any

    const jwt = await buildJwt(validClaims(), keyPair.privateKey, 'test-kid-1')
    const claims = await verifyOidcToken(jwt, env)

    expect(claims.repository).toBe('vercel/next.js')
    // Should have been called once (refetch on unknown kid)
    expect(globalThis.fetch).toHaveBeenCalledTimes(1)
  })

  it('rejects a token with missing kid even after JWKS refetch', async () => {
    const { verifyOidcToken } = await getVerifier()
    const env = createMockEnv(jwksResponse)

    // Mock fetch to return same keys (no match for 'unknown-kid')
    globalThis.fetch = vi.fn(async () =>
      new Response(jwksResponse, { status: 200 }),
    ) as any

    const jwt = await buildJwt(validClaims(), keyPair.privateKey, 'unknown-kid')

    await expect(verifyOidcToken(jwt, env)).rejects.toThrow('No matching key')
  })

  it('rejects a malformed JWT (wrong number of parts)', async () => {
    const { verifyOidcToken } = await getVerifier()
    const env = createMockEnv(jwksResponse)

    await expect(verifyOidcToken('not.a.valid.jwt.at.all', env)).rejects.toThrow()
  })

  it('rejects a token not yet valid (nbf in future)', async () => {
    const { verifyOidcToken } = await getVerifier()
    const env = createMockEnv(jwksResponse)

    const jwt = await buildJwt(
      validClaims({ nbf: Math.floor(Date.now() / 1000) + 300 }),
      keyPair.privateKey,
      'test-kid-1',
    )

    await expect(verifyOidcToken(jwt, env)).rejects.toThrow('not yet valid')
  })

  it('rejects a token missing required claims', async () => {
    const { verifyOidcToken } = await getVerifier()
    const env = createMockEnv(jwksResponse)

    const claims = validClaims()
    delete (claims as any).repository_visibility

    const jwt = await buildJwt(claims, keyPair.privateKey, 'test-kid-1')
    await expect(verifyOidcToken(jwt, env)).rejects.toThrow('Missing required OIDC claim')
  })

  it('accepts a private repo token (does not error, visibility check is caller concern)', async () => {
    const { verifyOidcToken } = await getVerifier()
    const env = createMockEnv(jwksResponse)

    const jwt = await buildJwt(
      validClaims({ repository_visibility: 'private' }),
      keyPair.privateKey,
      'test-kid-1',
    )
    const result = await verifyOidcToken(jwt, env)
    expect(result.repository_visibility).toBe('private')
  })
})
