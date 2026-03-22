// ---------------------------------------------------------------------------
// Fuzz tests for auth middleware — safety invariants
//
// The auth middleware is the first code to touch every request's Authorization
// header. It MUST handle arbitrary input without crashing.
//
// NOTE: numRuns capped at 500 — each iteration creates an HTTP request,
// runs auth middleware (including async OIDC verification for JWT-like inputs).
// ---------------------------------------------------------------------------

import { describe, expect, vi, beforeAll, beforeEach } from 'vitest'
import { test, fc } from '@fast-check/vitest'
import { Hono } from 'hono'
import { apiKeyAuth } from './auth'

// Cap iterations — middleware tests involve async HTTP + crypto
const MIDDLEWARE_FUZZ_RUNS = { numRuns: 500 }

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockEnv(jwksJson: string) {
  const kvStore = new Map<string, string>()
  kvStore.set('github:oidc:jwks', jwksJson)

  return {
    CACHE_KV: {
      get: vi.fn(async (key: string) => kvStore.get(key) ?? null),
      put: vi.fn(async () => {}),
    },
    KEYS_KV: {
      get: vi.fn(async () => null),
    },
  } as any
}

function createTestApp() {
  const app = new Hono<{ Bindings: any; Variables: any }>()
  app.use('*', apiKeyAuth)
  app.get('/test', (c) => {
    return c.json({
      tier: c.get('tier'),
      isAuthenticated: c.get('isAuthenticated'),
    })
  })
  return app
}

// ---------------------------------------------------------------------------
// Fuzz tests
// ---------------------------------------------------------------------------

describe('apiKeyAuth middleware fuzz', () => {
  let jwksJson: string
  let app: ReturnType<typeof createTestApp>

  // Generate key pair ONCE
  beforeAll(async () => {
    const keyPair = await crypto.subtle.generateKey(
      { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
      true, ['sign', 'verify'],
    ) as CryptoKeyPair
    const jwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey)
    jwksJson = JSON.stringify({ keys: [{ ...jwk, kid: 'test-kid-1', alg: 'RS256', use: 'sig' }] })
    app = createTestApp()
  })

  beforeEach(() => {
    globalThis.fetch = vi.fn(async () =>
      new Response(jwksJson, { status: 200 }),
    ) as any
  })

  test.prop([
    fc.string({ maxLength: 300 }),
  ], MIDDLEWARE_FUZZ_RUNS)('never returns 5xx on arbitrary Authorization headers', async (authValue) => {
    const env = createMockEnv(jwksJson)
    const res = await app.request('/test', {
      headers: { Authorization: authValue },
    }, env)
    expect(res.status).toBeLessThan(500)
  })

  test.prop([
    fc.string({ maxLength: 300 }),
  ], MIDDLEWARE_FUZZ_RUNS)('never returns 5xx on arbitrary Bearer tokens', async (token) => {
    const env = createMockEnv(jwksJson)
    const res = await app.request('/test', {
      headers: { Authorization: `Bearer ${token}` },
    }, env)
    expect(res.status).toBeLessThan(500)
  })

  test.prop([
    fc.string({ maxLength: 300 }),
  ], MIDDLEWARE_FUZZ_RUNS)('handles JWT-like garbage gracefully', async (suffix) => {
    const env = createMockEnv(jwksJson)
    const res = await app.request('/test', {
      headers: { Authorization: `Bearer eyJ${suffix}` },
    }, env)
    expect(res.status).toBeLessThan(500)
  })

  test.prop([
    fc.constantFrom('Bearer', 'bearer', 'BEARER', 'Basic', 'Token', ''),
    fc.string({ maxLength: 200 }),
  ], MIDDLEWARE_FUZZ_RUNS)('handles any auth scheme + value combination', async (scheme, value) => {
    const env = createMockEnv(jwksJson)
    const header = scheme ? `${scheme} ${value}` : value
    const res = await app.request('/test', {
      headers: { Authorization: header },
    }, env)
    expect(res.status).toBeLessThan(500)
  })
})
