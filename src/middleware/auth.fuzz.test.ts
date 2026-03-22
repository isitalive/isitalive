// ---------------------------------------------------------------------------
// Fuzz tests for auth middleware — safety invariants
//
// The auth middleware is the first code to touch every request's Authorization
// header. It MUST handle arbitrary input without crashing.
// ---------------------------------------------------------------------------

import { describe, expect, vi, beforeEach } from 'vitest'
import { test, fc } from '@fast-check/vitest'
import { Hono } from 'hono'
import { apiKeyAuth } from './auth'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function generateTestKeyPair(): Promise<CryptoKeyPair> {
  return await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true, ['sign', 'verify'],
  ) as CryptoKeyPair
}

async function exportPublicJwk(key: CryptoKey, kid: string) {
  const jwk = await crypto.subtle.exportKey('jwk', key)
  return { ...jwk, kid, alg: 'RS256', use: 'sig' }
}

function createMockEnv(jwksJson?: string) {
  const kvStore = new Map<string, string>()
  if (jwksJson) kvStore.set('github:oidc:jwks', jwksJson)

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

function createTestApp(env: any) {
  const app = new Hono<{ Bindings: any; Variables: any }>()
  app.use('*', apiKeyAuth)
  app.get('/test', (c) => {
    return c.json({
      tier: c.get('tier'),
      isAuthenticated: c.get('isAuthenticated'),
    })
  })
  return { app, env }
}

// ---------------------------------------------------------------------------
// Fuzz tests
// ---------------------------------------------------------------------------

describe('apiKeyAuth middleware fuzz', () => {
  let jwksJson: string

  beforeEach(async () => {
    const keyPair = await generateTestKeyPair()
    const publicJwk = await exportPublicJwk(keyPair.publicKey, 'test-kid-1')
    jwksJson = JSON.stringify({ keys: [publicJwk] })

    globalThis.fetch = vi.fn(async () =>
      new Response(jwksJson, { status: 200 }),
    ) as any
  })

  test.prop([
    fc.string({ maxLength: 500 }),
  ])('never returns 5xx on arbitrary Authorization headers', async (authValue) => {
    const env = createMockEnv(jwksJson)
    const { app } = createTestApp(env)

    const res = await app.request('/test', {
      headers: { Authorization: authValue },
    }, env)

    // Must never be a 5xx — either 200 (free tier) or 401 (private OIDC)
    expect(res.status).toBeLessThan(500)
  })

  test.prop([
    fc.string({ maxLength: 500 }),
  ])('never returns 5xx on arbitrary Bearer tokens', async (token) => {
    const env = createMockEnv(jwksJson)
    const { app } = createTestApp(env)

    const res = await app.request('/test', {
      headers: { Authorization: `Bearer ${token}` },
    }, env)

    expect(res.status).toBeLessThan(500)
  })

  // Targeted: JWT-like strings (starting with eyJ) that are garbage
  test.prop([
    fc.string({ maxLength: 500 }),
  ])('handles JWT-like garbage gracefully', async (suffix) => {
    const env = createMockEnv(jwksJson)
    const { app } = createTestApp(env)

    const res = await app.request('/test', {
      headers: { Authorization: `Bearer eyJ${suffix}` },
    }, env)

    // Should be 200 (fell through to free tier) — never 5xx
    expect(res.status).toBeLessThan(500)
  })

  test.prop([
    fc.constantFrom('Bearer', 'bearer', 'BEARER', 'Basic', 'Token', ''),
    fc.string({ maxLength: 300 }),
  ])('handles any auth scheme + value combination', async (scheme, value) => {
    const env = createMockEnv(jwksJson)
    const { app } = createTestApp(env)

    const header = scheme ? `${scheme} ${value}` : value
    const res = await app.request('/test', {
      headers: { Authorization: header },
    }, env)

    expect(res.status).toBeLessThan(500)
  })
})
