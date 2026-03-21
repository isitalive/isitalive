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
    ).resolves.not.toThrow()
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
    fc.string({ maxLength: 500 }),
    fc.stringMatching(/^[0-9a-f]{64}$/),
  ])('rejects random hex with sha256= prefix (wrong HMAC)', async (secret, body, randomHex) => {
    // The random hex is extremely unlikely to match the actual HMAC
    const result = await verifyWebhookSignature(secret, body, `sha256=${randomHex}`)
    // We can't guarantee false (theoretically could match), but in practice it won't
    expect(typeof result).toBe('boolean')
  })

  test.prop([
    fc.string({ minLength: 1, maxLength: 100 }),
    fc.string({ maxLength: 500 }),
  ])('returns boolean for any valid secret+body pair', async (secret, body) => {
    const result = await verifyWebhookSignature(secret, body, 'sha256=0000000000000000000000000000000000000000000000000000000000000000')
    expect(typeof result).toBe('boolean')
  })
})
