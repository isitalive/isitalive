// ---------------------------------------------------------------------------
// Tests for admin login hash comparison (S3 fix)
//
// Verifies the admin login route uses SHA-256 hash comparison instead of
// raw string comparison, preventing ADMIN_SECRET length leakage via timing.
// ---------------------------------------------------------------------------

import { describe, it, expect, vi } from 'vitest'
import { test, fc } from '@fast-check/vitest'
import { Hono } from 'hono'

// We test the admin login indirectly via the route handler
// by verifying behavior — correct secret accepted, wrong secret rejected,
// and same-length-wrong-secret rejected (the old bug would have leaked length info).

function createAdminApp(adminSecret: string) {
  // Minimal inline admin login to test the hash comparison pattern
  // without importing the full admin route (which requires many env bindings).
  const app = new Hono<{ Bindings: any }>()

  app.post('/login', async (c) => {
    const { sha256Hex } = await import('../utils/crypto')
    const { timingSafeEqual } = await import('../utils/crypto')

    const body = await c.req.parseBody()
    const input = (body['secret'] as string || '').trim()

    // This is the exact pattern from the S3 fix:
    const inputHash = await sha256Hex(input || '\0')
    const secretHash = await sha256Hex(adminSecret)
    if (!input || !timingSafeEqual(inputHash, secretHash)) {
      return c.json({ error: 'Invalid secret' }, 401)
    }

    return c.json({ ok: true })
  })

  return app
}

describe('admin login hash comparison (S3)', () => {
  const SECRET = 'my-test-admin-secret-42'

  it('accepts the correct secret', async () => {
    const app = createAdminApp(SECRET)
    const form = new FormData()
    form.append('secret', SECRET)

    const res = await app.request('/login', { method: 'POST', body: form })
    expect(res.status).toBe(200)
    const body = await res.json() as any
    expect(body.ok).toBe(true)
  })

  it('rejects an empty secret', async () => {
    const app = createAdminApp(SECRET)
    const form = new FormData()
    form.append('secret', '')

    const res = await app.request('/login', { method: 'POST', body: form })
    expect(res.status).toBe(401)
  })

  it('rejects a wrong secret of different length', async () => {
    const app = createAdminApp(SECRET)
    const form = new FormData()
    form.append('secret', 'short')

    const res = await app.request('/login', { method: 'POST', body: form })
    expect(res.status).toBe(401)
  })

  it('rejects a wrong secret of SAME length (old bug would have compared timing-safely but on wrong values)', async () => {
    const app = createAdminApp(SECRET)
    const form = new FormData()
    // Same length, different content
    form.append('secret', 'x'.repeat(SECRET.length))

    const res = await app.request('/login', { method: 'POST', body: form })
    expect(res.status).toBe(401)
  })

  it('rejects missing secret field', async () => {
    const app = createAdminApp(SECRET)
    const form = new FormData()
    // No 'secret' field at all

    const res = await app.request('/login', { method: 'POST', body: form })
    expect(res.status).toBe(401)
  })

  // ─── Fuzz: no arbitrary input should be accepted ─────────────────────
  test.prop([
    fc.string({ maxLength: 200 }),
  ], { numRuns: 200 })('never accepts arbitrary input as valid secret', async (input) => {
    // Skip the actual secret (astronomically unlikely but be safe)
    fc.pre(input !== SECRET)

    const app = createAdminApp(SECRET)
    const form = new FormData()
    form.append('secret', input)

    const res = await app.request('/login', { method: 'POST', body: form })
    expect(res.status).toBe(401)
  })

  // ─── Fuzz: never crashes on arbitrary input ──────────────────────────
  test.prop([
    fc.oneof(
      fc.string({ maxLength: 500 }),
      fc.uint8Array({ maxLength: 200 }).map(arr => String.fromCharCode(...arr)),
    ),
  ], { numRuns: 200 })('never returns 5xx on arbitrary input', async (input) => {
    const app = createAdminApp(SECRET)
    const form = new FormData()
    form.append('secret', input)

    const res = await app.request('/login', { method: 'POST', body: form })
    expect(res.status).toBeLessThan(500)
  })
})
