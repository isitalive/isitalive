// ---------------------------------------------------------------------------
// Fuzz tests for webhook signature verification — safety invariants
// ---------------------------------------------------------------------------

import { describe, expect } from 'vitest'
import { test, fc } from '@fast-check/vitest'
import { verifyWebhookSignature } from './verify'

describe('verifyWebhookSignature fuzz', () => {
  test.prop([
    fc.string({ minLength: 1, maxLength: 100 }),
    fc.string({ maxLength: 500 }),
    fc.string({ maxLength: 200 }),
  ])('never throws on arbitrary inputs', async (secret, body, signature) => {
    await expect(
      verifyWebhookSignature(secret, body, signature),
    ).resolves.toBeTypeOf('boolean')
  })

  test.prop([
    fc.string({ minLength: 1, maxLength: 100 }),
    fc.string({ maxLength: 500 }),
  ])('rejects null signature header', async (secret, body) => {
    const result = await verifyWebhookSignature(secret, body, null)
    expect(result).toBe(false)
  })

  test.prop([
    fc.string({ minLength: 1, maxLength: 100 }),
    fc.string({ maxLength: 500 }),
    fc.string({ maxLength: 200 }),
  ])('rejects signatures without sha256= prefix', async (secret, body, randomSig) => {
    // Ensure it doesn't start with sha256=
    const sig = randomSig.startsWith('sha256=') ? `md5=${randomSig}` : randomSig
    const result = await verifyWebhookSignature(secret, body, sig)
    expect(result).toBe(false)
  })

  test.prop([
    fc.string({ minLength: 1, maxLength: 100 }),
    fc.string({ minLength: 1, maxLength: 500 }),
    fc.string({ minLength: 1, maxLength: 100 }),
  ])('rejects signature computed with a different secret', async (secret, body, otherSecret) => {
    // Use a deterministically-wrong secret to guarantee mismatch
    const wrongSecret = secret === otherSecret ? `${otherSecret}_wrong` : otherSecret

    // Compute a valid HMAC with the wrong secret
    const encoder = new TextEncoder()
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(wrongSecret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    )
    const mac = await crypto.subtle.sign('HMAC', key, encoder.encode(body))
    const hex = Array.from(new Uint8Array(mac), b => b.toString(16).padStart(2, '0')).join('')

    const result = await verifyWebhookSignature(secret, body, `sha256=${hex}`)
    expect(result).toBe(false)
  })

  test.prop([
    fc.string({ minLength: 1, maxLength: 100 }),
    fc.string({ maxLength: 500 }),
  ])('returns boolean for any valid secret+body pair', async (secret, body) => {
    const result = await verifyWebhookSignature(secret, body, 'sha256=0000000000000000000000000000000000000000000000000000000000000000')
    expect(typeof result).toBe('boolean')
  })
})
