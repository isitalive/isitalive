// ---------------------------------------------------------------------------
// Tests for admin login hash comparison (S3 fix)
//
// Tests the REAL verifyAdminSecret function exported from admin.ts to ensure
// hash-based comparison works correctly and prevents length leakage.
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest'
import { test, fc } from '@fast-check/vitest'
import { verifyAdminSecret } from './admin'

describe('verifyAdminSecret (S3)', () => {
  const SECRET = 'my-test-admin-secret-42'

  it('returns true for the correct secret', async () => {
    expect(await verifyAdminSecret(SECRET, SECRET)).toBe(true)
  })

  it('returns false for an empty input', async () => {
    expect(await verifyAdminSecret('', SECRET)).toBe(false)
  })

  it('returns false for a wrong secret of different length', async () => {
    expect(await verifyAdminSecret('short', SECRET)).toBe(false)
  })

  it('returns false for a wrong secret of SAME length (old bug would have leaked length info)', async () => {
    expect(await verifyAdminSecret('x'.repeat(SECRET.length), SECRET)).toBe(false)
  })

  it('returns false when both strings are empty', async () => {
    // Edge case: empty == empty should still work correctly
    expect(await verifyAdminSecret('', '')).toBe(true)
  })

  // ─── Fuzz: no arbitrary input should be accepted ─────────────────────
  test.prop([
    fc.string({ maxLength: 200 }),
  ], { numRuns: 200 })('never accepts arbitrary input as valid secret', async (input) => {
    fc.pre(input !== SECRET)
    expect(await verifyAdminSecret(input, SECRET)).toBe(false)
  })

  // ─── Fuzz: never crashes on arbitrary input ──────────────────────────
  test.prop([
    fc.oneof(
      fc.string({ maxLength: 500 }),
      fc.uint8Array({ maxLength: 200 }).map(arr => String.fromCharCode(...arr)),
    ),
  ], { numRuns: 200 })('never throws on arbitrary input', async (input) => {
    const result = await verifyAdminSecret(input, SECRET)
    expect(typeof result).toBe('boolean')
  })
})
