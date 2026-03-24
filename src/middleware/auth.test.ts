import { describe, expect, it, vi, beforeEach } from 'vitest'
import { Hono } from 'hono'
import { apiKeyAuth } from './auth'

// ---------------------------------------------------------------------------
// Test helpers — generate RSA keys + JWTs for OIDC testing
// ---------------------------------------------------------------------------

async function generateTestKeyPair(): Promise<CryptoKeyPair> {
  return await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  ) as CryptoKeyPair
}

async function exportPublicJwk(key: CryptoKey, kid: string) {
  const jwk = await crypto.subtle.exportKey('jwk', key)
  return { ...jwk, kid, alg: 'RS256', use: 'sig' }
}

function base64url(str: string): string {
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64urlFromBuffer(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function buildJwt(
  payload: Record<string, unknown>,
  privateKey: CryptoKey,
  kid: string,
): Promise<string> {
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid }))
  const body = base64url(JSON.stringify(payload))
  const signingInput = `${header}.${body}`
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    privateKey,
    new TextEncoder().encode(signingInput),
  )
  return `${signingInput}.${base64urlFromBuffer(signature)}`
}

function validOidcClaims(overrides: Record<string, unknown> = {}) {
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
    actor: 'octocat',
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Mock env factory
// ---------------------------------------------------------------------------

function createMockEnv(opts: {
  apiKeys?: Record<string, any>,
  jwksJson?: string,
} = {}) {
  const kvStore = new Map<string, string>()

  // Pre-populate API keys
  for (const [key, value] of Object.entries(opts.apiKeys ?? {})) {
    kvStore.set(key, JSON.stringify(value))
  }

  // Pre-populate JWKS
  if (opts.jwksJson) {
    kvStore.set('github:oidc:jwks', opts.jwksJson)
  }

  return {
    CACHE_KV: {
      get: vi.fn(async (key: string, format?: string) => {
        const raw = kvStore.get(key) ?? null
        if (!raw) return null
        return format === 'json' ? JSON.parse(raw) : raw
      }),
      put: vi.fn(async (key: string, value: string) => { kvStore.set(key, value) }),
    },
    KEYS_KV: {
      get: vi.fn(async (key: string, format?: string) => {
        const raw = kvStore.get(key) ?? null
        if (!raw) return null
        return format === 'json' ? JSON.parse(raw) : raw
      }),
    },
    RATE_LIMITER_ANON: { limit: vi.fn(async () => ({ success: true })) },
    RATE_LIMITER_AUTH: { limit: vi.fn(async () => ({ success: true })) },
  } as any
}

// ---------------------------------------------------------------------------
// Test app factory — mounts apiKeyAuth + a test route
// ---------------------------------------------------------------------------

function createTestApp(env: any) {
  const app = new Hono<{ Bindings: any; Variables: any }>()
  app.use('*', apiKeyAuth)
  app.get('/test', (c) => {
    return c.json({
      tier: c.get('tier'),
      keyName: c.get('keyName'),
      isAuthenticated: c.get('isAuthenticated'),
      oidcClaims: c.get('oidcClaims'),
    })
  })
  return { app, env }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('apiKeyAuth middleware', () => {
  let keyPair: CryptoKeyPair
  let jwksJson: string

  beforeEach(async () => {
    keyPair = await generateTestKeyPair()
    const publicJwk = await exportPublicJwk(keyPair.publicKey, 'test-kid-1')
    jwksJson = JSON.stringify({ keys: [publicJwk] })
  })

  describe('no auth header', () => {
    it('defaults to free tier, unauthenticated', async () => {
      const env = createMockEnv()
      const { app } = createTestApp(env)

      const res = await app.request('/test', {}, env)
      const body = await res.json() as any
      expect(body.tier).toBe('free')
      expect(body.keyName).toBeNull()
      expect(body.isAuthenticated).toBe(false)
      expect(body.oidcClaims).toBeNull()
    })
  })

  describe('API key auth', () => {
    it('authenticates with a valid API key', async () => {
      const env = createMockEnv({
        apiKeys: { 'sk_test123': { tier: 'pro', name: 'TestCo', active: true } },
      })
      const { app } = createTestApp(env)

      const res = await app.request('/test', {
        headers: { Authorization: 'Bearer sk_test123' },
      }, env)
      const body = await res.json() as any
      expect(body.tier).toBe('pro')
      expect(body.keyName).toBe('TestCo')
      expect(body.isAuthenticated).toBe(true)
      expect(body.oidcClaims).toBeNull()
    })

    it('falls through to free tier for invalid API key', async () => {
      const env = createMockEnv()
      const { app } = createTestApp(env)

      const res = await app.request('/test', {
        headers: { Authorization: 'Bearer sk_invalid' },
      }, env)
      const body = await res.json() as any
      expect(body.tier).toBe('free')
      expect(body.isAuthenticated).toBe(false)
    })

    it('falls through to free tier for inactive API key', async () => {
      const env = createMockEnv({
        apiKeys: { 'sk_inactive': { tier: 'pro', name: 'DeadCo', active: false } },
      })
      const { app } = createTestApp(env)

      const res = await app.request('/test', {
        headers: { Authorization: 'Bearer sk_inactive' },
      }, env)
      const body = await res.json() as any
      expect(body.isAuthenticated).toBe(false)
    })
  })

  describe('OIDC auth', () => {
    it('authenticates with a valid OIDC token for public repo', async () => {
      const env = createMockEnv({ jwksJson })
      const { app } = createTestApp(env)

      const jwt = await buildJwt(validOidcClaims(), keyPair.privateKey, 'test-kid-1')
      const res = await app.request('/test', {
        headers: { Authorization: `Bearer ${jwt}` },
      }, env)
      const body = await res.json() as any
      expect(body.isAuthenticated).toBe(true)
      expect(body.keyName).toBe('oidc:vercel/next.js')
      expect(body.tier).toBe('free')
      expect(body.oidcClaims.repository).toBe('vercel/next.js')
      expect(body.oidcClaims.repository_visibility).toBe('public')
    })

    it('rejects OIDC token for private repo with 401', async () => {
      const env = createMockEnv({ jwksJson })
      const { app } = createTestApp(env)

      const jwt = await buildJwt(
        validOidcClaims({ repository_visibility: 'private' }),
        keyPair.privateKey,
        'test-kid-1',
      )
      const res = await app.request('/test', {
        headers: { Authorization: `Bearer ${jwt}` },
      }, env)
      expect(res.status).toBe(401)
      const body = await res.json() as any
      expect(body.error).toContain('free for open-source')
    })

    it('falls through to free tier for invalid OIDC token', async () => {
      const env = createMockEnv({ jwksJson })
      const { app } = createTestApp(env)

      // Malformed JWT (valid base64url start but garbage)
      const res = await app.request('/test', {
        headers: { Authorization: 'Bearer eyJhbGciOiJSUzI1NiJ9.eyJmb28iOiJiYXIifQ.invalidsig' },
      }, env)
      const body = await res.json() as any
      expect(body.isAuthenticated).toBe(false)
      expect(body.tier).toBe('free')
    })

    it('falls through to free tier when JWKS fetch fails (no cached keys)', async () => {
      // No JWKS cached — forces remote fetch which will fail (no fetch mock)
      const env = createMockEnv()
      const { app } = createTestApp(env)

      // Mock fetch to simulate JWKS endpoint returning 404
      const originalFetch = globalThis.fetch
      globalThis.fetch = vi.fn(async () =>
        new Response('not found', { status: 404 }),
      ) as any

      try {
        const jwt = await buildJwt(validOidcClaims(), keyPair.privateKey, 'test-kid-1')
        const res = await app.request('/test', {
          headers: { Authorization: `Bearer ${jwt}` },
        }, env)
        const body = await res.json() as any
        // Should fall through as unauthenticated, NOT return 500
        expect(res.status).toBe(200)
        expect(body.isAuthenticated).toBe(false)
        expect(body.tier).toBe('free')
      } finally {
        globalThis.fetch = originalFetch
      }
    })
  })
})
