import { describe, expect, it, vi } from 'vitest'
import { app } from '../app'

const executionCtx: ExecutionContext = {
  waitUntil: (_p: Promise<unknown>) => {},
  passThroughOnException: () => {},
  props: {},
}

describe('/_data/waitlist', () => {
  it('does not expose a pricing page route', async () => {
    const res = await app.fetch(
      new Request('https://isitalive.dev/pricing'),
      {} as any,
      executionCtx,
    )

    expect(res.status).not.toBe(200)
  })

  it('does not expose a public waitlist signup endpoint', async () => {
    const put = vi.fn()
    const res = await app.fetch(
      new Request('https://isitalive.dev/_data/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'alice@example.com' }),
      }),
      { WAITLIST_KV: { put } } as any,
      executionCtx,
    )

    expect(res.status).not.toBe(200)
    expect(put).not.toHaveBeenCalled()
  })
})
