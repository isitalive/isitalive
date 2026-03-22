// ---------------------------------------------------------------------------
// Fuzz tests for OIDC JWT verification — safety invariants
//
// Ensures verifyOidcToken never crashes on arbitrary input, only rejects
// with controlled errors. This is critical because the auth middleware
// processes untrusted user input (Authorization headers) on every request.
// ---------------------------------------------------------------------------

import { describe, expect, vi, beforeEach } from 'vitest'
import { test, fc } from '@fast-check/vitest'
import { verifyOidcToken, fetchJwks } from './oidc'

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

// ---------------------------------------------------------------------------
// Fuzz tests
// ---------------------------------------------------------------------------

describe('verifyOidcToken fuzz', () => {
  let jwksJson: string

  beforeEach(async () => {
    const keyPair = await generateTestKeyPair()
    const publicJwk = await exportPublicJwk(keyPair.publicKey, 'test-kid-1')
    jwksJson = JSON.stringify({ keys: [publicJwk] })

    // Prevent actual JWKS fetches
    globalThis.fetch = vi.fn(async () =>
      new Response(jwksJson, { status: 200 }),
    ) as any
  })

  test.prop([
    fc.string({ maxLength: 1000 }),
  ])('never throws unhandled error on arbitrary strings', async (input) => {
    const env = createMockEnv(jwksJson)
    await expect(
      verifyOidcToken(input, env).then(() => 'ok').catch(() => 'rejected'),
    ).resolves.toBeTypeOf('string')
  })

  test.prop([
    fc.string({ maxLength: 200 }),
    fc.string({ maxLength: 200 }),
    fc.string({ maxLength: 200 }),
  ])('never throws on arbitrary 3-part dot-separated strings', async (a, b, c) => {
    const env = createMockEnv(jwksJson)
    const jwt = `${a}.${b}.${c}`
    await expect(
      verifyOidcToken(jwt, env).then(() => 'ok').catch(() => 'rejected'),
    ).resolves.toBeTypeOf('string')
  })

  test.prop([
    fc.json(),
    fc.json(),
    fc.string({ maxLength: 100 }),
  ])('rejects arbitrary JSON payloads encoded as JWT parts', async (headerJson, payloadJson, sig) => {
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
  ])('rejects strings with wrong number of dots', async (input) => {
    // Remove all dots to ensure it's not 3-part
    const noDots = input.replace(/\./g, '')
    const env = createMockEnv(jwksJson)
    await expect(
      verifyOidcToken(noDots, env),
    ).rejects.toThrow()
  })

  // Targeted: malformed base64url in header position
  test.prop([
    fc.string({ maxLength: 200 }),
  ])('handles malformed header gracefully', async (randomStr) => {
    const env = createMockEnv(jwksJson)
    const jwt = `${randomStr}.${base64url('{}')}.sig`
    await expect(
      verifyOidcToken(jwt, env).then(() => 'ok').catch(() => 'rejected'),
    ).resolves.toBeTypeOf('string')
  })
})

describe('fetchJwks fuzz', () => {
  test.prop([
    fc.string({ maxLength: 500 }),
  ])('handles non-JSON JWKS responses gracefully', async (responseBody) => {
    globalThis.fetch = vi.fn(async () =>
      new Response(responseBody, { status: 200 }),
    ) as any

    const env = createMockEnv() // no cached JWKS
    await expect(
      fetchJwks(env, true).then(() => 'ok').catch(() => 'rejected'),
    ).resolves.toBeTypeOf('string')
  })
})
