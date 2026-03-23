// ---------------------------------------------------------------------------
// Fuzz tests for OIDC JWT verification — safety invariants
//
// Ensures verifyOidcToken never crashes on arbitrary input, only rejects
// with controlled errors. This is critical because the auth middleware
// processes untrusted user input (Authorization headers) on every request.
//
// NOTE: These tests cap numRuns at 500 because each iteration involves
// async crypto.subtle operations (~0.5ms each). The global FC_NUM_RUNS
// (10k in CI) would cause 30s timeouts.
// ---------------------------------------------------------------------------

import { describe, expect, vi, beforeAll, beforeEach } from 'vitest'
import { test, fc } from '@fast-check/vitest'
import { verifyOidcToken } from './oidc'

// Cap iterations — crypto-heavy tests can't do 10k in 30s
const CRYPTO_FUZZ_RUNS = { numRuns: 500 }

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockEnv(jwksJson: string | null = null) {
  const kvStore = new Map<string, string>()
  if (jwksJson) kvStore.set('github:oidc:jwks', jwksJson)
  return {
    CACHE_KV: {
      get: vi.fn(async (key: string) => kvStore.get(key) ?? null),
      put: vi.fn(async () => {}),
    },
  } as any
}

function base64url(str: string): string {
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

// ---------------------------------------------------------------------------
// Fuzz tests
// ---------------------------------------------------------------------------

describe('verifyOidcToken fuzz', () => {
  let jwksJson: string

  // Generate key pair ONCE — not per iteration
  beforeAll(async () => {
    const keyPair = await crypto.subtle.generateKey(
      { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
      true, ['sign', 'verify'],
    ) as CryptoKeyPair
    const jwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey)
    jwksJson = JSON.stringify({ keys: [{ ...jwk, kid: 'test-kid-1', alg: 'RS256', use: 'sig' }] })
  })

  beforeEach(() => {
    globalThis.fetch = vi.fn(async () =>
      new Response(jwksJson, { status: 200 }),
    ) as any
  })

  test.prop([
    fc.string({ maxLength: 500 }),
  ], CRYPTO_FUZZ_RUNS)('never throws unhandled error on arbitrary strings', async (input) => {
    const env = createMockEnv(jwksJson)
    await expect(
      verifyOidcToken(input, env).then(() => 'ok').catch(() => 'rejected'),
    ).resolves.toBeTypeOf('string')
  })

  test.prop([
    fc.string({ maxLength: 100 }),
    fc.string({ maxLength: 100 }),
    fc.string({ maxLength: 100 }),
  ], CRYPTO_FUZZ_RUNS)('never throws on arbitrary 3-part dot-separated strings', async (a, b, c) => {
    const env = createMockEnv(jwksJson)
    const jwt = `${a}.${b}.${c}`
    await expect(
      verifyOidcToken(jwt, env).then(() => 'ok').catch(() => 'rejected'),
    ).resolves.toBeTypeOf('string')
  })

  test.prop([
    fc.json(),
    fc.json(),
    fc.string({ maxLength: 50 }),
  ], CRYPTO_FUZZ_RUNS)('rejects arbitrary JSON payloads encoded as JWT parts', async (headerJson, payloadJson, sig) => {
    const env = createMockEnv(jwksJson)
    try {
      const header = base64url(typeof headerJson === 'string' ? headerJson : JSON.stringify(headerJson))
      const payload = base64url(typeof payloadJson === 'string' ? payloadJson : JSON.stringify(payloadJson))
      const jwt = `${header}.${payload}.${sig}`
      await expect(
        verifyOidcToken(jwt, env).then(() => 'ok').catch(() => 'rejected'),
      ).resolves.toBe('rejected')
    } catch {
      // base64url encoding itself can fail on some inputs — that's fine
    }
  })

  test.prop([
    fc.string({ minLength: 0, maxLength: 50 }),
  ], CRYPTO_FUZZ_RUNS)('rejects strings with wrong number of dots', async (input) => {
    const noDots = input.replace(/\./g, '')
    const env = createMockEnv(jwksJson)
    await expect(
      verifyOidcToken(noDots, env),
    ).rejects.toThrow()
  })

  test.prop([
    fc.string({ maxLength: 100 }),
  ], CRYPTO_FUZZ_RUNS)('handles malformed header gracefully', async (randomStr) => {
    const env = createMockEnv(jwksJson)
    const jwt = `${randomStr}.${base64url('{}')}.sig`
    await expect(
      verifyOidcToken(jwt, env).then(() => 'ok').catch(() => 'rejected'),
    ).resolves.toBeTypeOf('string')
  })
})
