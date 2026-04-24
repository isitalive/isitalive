import { describe, expect, it, vi } from 'vitest'
import { Hono } from 'hono'
import { rateLimit } from './rateLimit'

type LimitArgs = Parameters<RateLimit['limit']>
type LimitReturn = ReturnType<RateLimit['limit']>

function buildApp(limitFn: ReturnType<typeof vi.fn<(...a: LimitArgs) => LimitReturn>>) {
  const app = new Hono<any>()
  app.use('*', async (c, next) => {
    c.set('isAuthenticated', Boolean((c.req.raw.headers.get('x-test-auth'))))
    c.set('keyName', c.req.raw.headers.get('x-test-key') ?? null)
    c.set('tier', 'free')
    return next()
  })
  app.use('*', rateLimit as any)
  app.all('*', (c) => c.json({ ok: true }))

  const env = {
    RATE_LIMITER_ANON: { limit: limitFn },
    RATE_LIMITER_AUTH: { limit: limitFn },
  } as any
  return { app, env }
}

describe('rateLimit — per-repo anonymous key scoping', () => {
  it('builds distinct keys for different repos from the same IP', async () => {
    const limit = vi.fn<(...a: LimitArgs) => LimitReturn>(async () => ({ success: true }))
    const { app, env } = buildApp(limit)

    await app.request(
      'https://x/api/check/github/vercel/next.js',
      { headers: { 'cf-connecting-ip': '203.0.113.1' } },
      env,
    )
    await app.request(
      'https://x/api/check/github/sveltejs/svelte',
      { headers: { 'cf-connecting-ip': '203.0.113.1' } },
      env,
    )

    expect(limit).toHaveBeenCalledTimes(2)
    expect(limit.mock.calls[0][0]).toEqual({ key: 'ip:203.0.113.1:github/vercel/next.js' })
    expect(limit.mock.calls[1][0]).toEqual({ key: 'ip:203.0.113.1:github/sveltejs/svelte' })
  })

  it('lowercases provider/owner/repo in the key', async () => {
    const limit = vi.fn<(...a: LimitArgs) => LimitReturn>(async () => ({ success: true }))
    const { app, env } = buildApp(limit)

    await app.request(
      'https://x/api/check/GITHUB/Vercel/Next.JS',
      { headers: { 'cf-connecting-ip': '203.0.113.2' } },
      env,
    )

    expect(limit.mock.calls[0][0]).toEqual({ key: 'ip:203.0.113.2:github/vercel/next.js' })
  })

  it('falls back to plain per-IP key for non-/api/check paths', async () => {
    const limit = vi.fn<(...a: LimitArgs) => LimitReturn>(async () => ({ success: true }))
    const { app, env } = buildApp(limit)

    await app.request(
      'https://x/api/manifest',
      { method: 'POST', headers: { 'cf-connecting-ip': '203.0.113.3' } },
      env,
    )

    expect(limit.mock.calls[0][0]).toEqual({ key: 'ip:203.0.113.3' })
  })

  it('scopes /_data/deps requests by provider/owner/repo for anonymous callers', async () => {
    const limit = vi.fn<(...a: LimitArgs) => LimitReturn>(async () => ({ success: true }))
    const { app, env } = buildApp(limit)

    await app.request(
      'https://x/_data/deps/github/vercel/next.js',
      { headers: { 'cf-connecting-ip': '203.0.113.10' } },
      env,
    )

    expect(limit.mock.calls[0][0]).toEqual({ key: 'ip:203.0.113.10:deps:github/vercel/next.js' })
  })

  it('falls back to plain per-IP key when params are invalid (DoS-resistant)', async () => {
    const limit = vi.fn<(...a: LimitArgs) => LimitReturn>(async () => ({ success: true }))
    const { app, env } = buildApp(limit)

    // Owner is over-long and contains invalid characters — must not inflate
    // rate-limit cardinality.
    const longOwner = 'a'.repeat(200)
    await app.request(
      `https://x/api/check/github/${longOwner}/repo%20with%20spaces`,
      { headers: { 'cf-connecting-ip': '203.0.113.9' } },
      env,
    )

    expect(limit.mock.calls[0][0]).toEqual({ key: 'ip:203.0.113.9' })
  })

  it('uses key-scoped name for authenticated callers (not IP)', async () => {
    const limit = vi.fn<(...a: LimitArgs) => LimitReturn>(async () => ({ success: true }))
    const { app, env } = buildApp(limit)

    await app.request(
      'https://x/api/check/github/a/b',
      {
        headers: {
          'cf-connecting-ip': '203.0.113.4',
          'x-test-auth': '1',
          'x-test-key': 'acme-prod',
        },
      },
      env,
    )

    expect(limit.mock.calls[0][0]).toEqual({ key: 'key:acme-prod' })
  })

  it('returns 429 with Retry-After when rate-limit is exceeded', async () => {
    const limit = vi.fn(async () => ({ success: false }))
    const { app, env } = buildApp(limit)

    const res = await app.request(
      'https://x/api/check/github/a/b',
      { headers: { 'cf-connecting-ip': '203.0.113.5' } },
      env,
    )

    expect(res.status).toBe(429)
    expect(res.headers.get('Retry-After')).toBe('60')
  })
})
