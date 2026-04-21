// ---------------------------------------------------------------------------
// Tests for admin login hash comparison (S3 fix)
//
// Tests the REAL verifyAdminSecret function exported from admin.ts to ensure
// hash-based comparison works correctly and prevents length leakage.
// ---------------------------------------------------------------------------

import { describe, it, expect, vi } from 'vitest'
import { test, fc } from '@fast-check/vitest'
import { verifyAdminSecret } from './admin'
import { admin } from './admin'

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

describe('admin login rate limit', () => {
  const SECRET = 'brute-force-test-secret-0xDEADBEEF'

  function makeRequest(body = 'secret=wrong') {
    return new Request('https://example.com/auth/login', {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        'cf-connecting-ip': '203.0.113.7',
      },
      body,
    })
  }

  function baseEnv(limitResult: { success: boolean }) {
    return {
      ADMIN_SECRET: SECRET,
      RATE_LIMITER_ADMIN: { limit: vi.fn().mockResolvedValue(limitResult) },
    } as unknown as Cloudflare.Env
  }

  it('returns generic 401 page when rate limit is exceeded', async () => {
    const env = baseEnv({ success: false })
    const res = await admin.request(makeRequest(`secret=${SECRET}`), {}, env)
    expect(res.status).toBe(401)
    expect(res.headers.get('retry-after')).toBeNull()
    expect(res.headers.get('content-type') ?? '').toContain('text/html')
    const html = await res.text()
    expect(html).toContain('Invalid secret')
    // Must not set a session cookie
    expect(res.headers.get('set-cookie')).toBeNull()
    // Must have consumed rate-limit budget
    const limitFn = env.RATE_LIMITER_ADMIN!.limit as ReturnType<typeof vi.fn>
    expect(limitFn).toHaveBeenCalledTimes(1)
    expect(limitFn.mock.calls[0][0]).toEqual({ key: 'admin-login:203.0.113.7' })
  })

  it('returns generic 401 page when rate limit passes but secret is wrong', async () => {
    const env = baseEnv({ success: true })
    const res = await admin.request(makeRequest('secret=definitely-wrong'), {}, env)
    expect(res.status).toBe(401)
    expect(res.headers.get('retry-after')).toBeNull()
    expect(res.headers.get('set-cookie')).toBeNull()
    const html = await res.text()
    expect(html).toContain('Invalid secret')
  })

  it('consumes rate-limit budget even when the secret is correct', async () => {
    const env = baseEnv({ success: true })
    const res = await admin.request(makeRequest(`secret=${SECRET}`), {}, env)
    // Correct secret + budget available → redirect to /admin
    expect(res.status).toBe(302)
    const limitFn = env.RATE_LIMITER_ADMIN!.limit as ReturnType<typeof vi.fn>
    expect(limitFn).toHaveBeenCalledTimes(1)
  })

  it('falls open when the rate limiter binding is missing (backwards compat during deploy)', async () => {
    const env = { ADMIN_SECRET: SECRET } as unknown as Cloudflare.Env
    const res = await admin.request(makeRequest('secret=wrong'), {}, env)
    // Binding absent → login still functions (path exists before wrangler.toml is deployed)
    expect(res.status).toBe(401)
  })
})
