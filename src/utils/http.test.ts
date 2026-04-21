// ---------------------------------------------------------------------------
// Tests for fetchWithRetry — retry, backoff, Retry-After, rate-limit 403s
// ---------------------------------------------------------------------------

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { fetchWithRetry } from './http'

type FetchResponder = (request: Request) => Response | Promise<Response>

function installFetchMock(responders: FetchResponder[]): { calls: Request[]; restore: () => void } {
  const calls: Request[] = []
  let index = 0
  const original = globalThis.fetch
  const mock = vi.fn(async (input: any, init?: any) => {
    const req = new Request(input instanceof Request ? input : String(input), init)
    calls.push(req)
    const responder = responders[Math.min(index, responders.length - 1)]
    index++
    return responder(req)
  })
  globalThis.fetch = mock as unknown as typeof globalThis.fetch
  return { calls, restore: () => { globalThis.fetch = original } }
}

function noSleep(_ms: number): Promise<void> {
  return Promise.resolve()
}

describe('fetchWithRetry', () => {
  let mock: { calls: Request[]; restore: () => void } | null = null

  afterEach(() => {
    mock?.restore()
    mock = null
  })

  it('returns the first 2xx response without retrying', async () => {
    mock = installFetchMock([
      () => new Response('ok', { status: 200 }),
    ])

    const res = await fetchWithRetry('https://example.com/x', {
      timeoutMs: 1000,
      timeoutMessage: 't',
      sleepFn: noSleep,
    })

    expect(res.status).toBe(200)
    expect(mock.calls.length).toBe(1)
  })

  it('retries on 503 and returns the eventual 200', async () => {
    mock = installFetchMock([
      () => new Response('', { status: 503 }),
      () => new Response('', { status: 503 }),
      () => new Response('ok', { status: 200 }),
    ])

    const res = await fetchWithRetry('https://example.com/x', {
      timeoutMs: 1000,
      timeoutMessage: 't',
      sleepFn: noSleep,
    })

    expect(res.status).toBe(200)
    expect(mock!.calls.length).toBe(3)
  })

  it('honors Retry-After seconds, capped at maxRetryAfterMs', async () => {
    mock = installFetchMock([
      () => new Response('', { status: 429, headers: { 'retry-after': '99' } }),
      () => new Response('ok', { status: 200 }),
    ])
    const sleeps: number[] = []

    const res = await fetchWithRetry('https://example.com/x', {
      timeoutMs: 1000,
      timeoutMessage: 't',
      maxRetryAfterMs: 5000,
      sleepFn: async (ms) => { sleeps.push(ms) },
    })

    expect(res.status).toBe(200)
    expect(sleeps).toEqual([5000])
  })

  it('honors Retry-After below the cap', async () => {
    mock = installFetchMock([
      () => new Response('', { status: 429, headers: { 'retry-after': '2' } }),
      () => new Response('ok', { status: 200 }),
    ])
    const sleeps: number[] = []

    await fetchWithRetry('https://example.com/x', {
      timeoutMs: 1000,
      timeoutMessage: 't',
      sleepFn: async (ms) => { sleeps.push(ms) },
    })

    expect(sleeps).toEqual([2000])
  })

  it('retries 403 when x-ratelimit-remaining is 0', async () => {
    mock = installFetchMock([
      () => new Response('', { status: 403, headers: { 'x-ratelimit-remaining': '0' } }),
      () => new Response('ok', { status: 200 }),
    ])

    const res = await fetchWithRetry('https://example.com/x', {
      timeoutMs: 1000,
      timeoutMessage: 't',
      sleepFn: noSleep,
    })

    expect(res.status).toBe(200)
    expect(mock!.calls.length).toBe(2)
  })

  it('does NOT retry a plain 403', async () => {
    mock = installFetchMock([
      () => new Response('', { status: 403 }),
      () => new Response('ok', { status: 200 }),
    ])

    const res = await fetchWithRetry('https://example.com/x', {
      timeoutMs: 1000,
      timeoutMessage: 't',
      sleepFn: noSleep,
    })

    expect(res.status).toBe(403)
    expect(mock!.calls.length).toBe(1)
  })

  it('does NOT retry a 404', async () => {
    mock = installFetchMock([
      () => new Response('', { status: 404 }),
    ])

    const res = await fetchWithRetry('https://example.com/x', {
      timeoutMs: 1000,
      timeoutMessage: 't',
      sleepFn: noSleep,
    })

    expect(res.status).toBe(404)
    expect(mock!.calls.length).toBe(1)
  })

  it('after retries are exhausted, returns the last failing Response', async () => {
    mock = installFetchMock([
      () => new Response('', { status: 503 }),
      () => new Response('', { status: 503 }),
      () => new Response('', { status: 503 }),
      () => new Response('', { status: 503 }),
    ])

    const res = await fetchWithRetry('https://example.com/x', {
      timeoutMs: 1000,
      timeoutMessage: 't',
      sleepFn: noSleep,
    })

    expect(res.status).toBe(503)
    expect(mock!.calls.length).toBe(4) // 1 initial + 3 retries
  })

  it('retries a timeout once, then rethrows', async () => {
    mock = installFetchMock([
      () => { throw Object.assign(new Error('boom'), { name: 'TimeoutError' }) },
      () => { throw Object.assign(new Error('boom'), { name: 'TimeoutError' }) },
    ])

    await expect(
      fetchWithRetry('https://example.com/x', {
        timeoutMs: 1000,
        timeoutMessage: 'upstream timed out after 1000ms',
        sleepFn: noSleep,
      }),
    ).rejects.toThrow('upstream timed out after 1000ms')

    expect(mock!.calls.length).toBe(2) // initial + 1 retry, then throw
  })

  it('uses the default backoff sequence when Retry-After is absent', async () => {
    mock = installFetchMock([
      () => new Response('', { status: 503 }),
      () => new Response('', { status: 503 }),
      () => new Response('', { status: 503 }),
      () => new Response('ok', { status: 200 }),
    ])
    const sleeps: number[] = []

    const res = await fetchWithRetry('https://example.com/x', {
      timeoutMs: 1000,
      timeoutMessage: 't',
      sleepFn: async (ms) => { sleeps.push(ms) },
    })

    expect(res.status).toBe(200)
    expect(sleeps).toEqual([200, 500, 1200])
  })

  it('does NOT retry non-timeout network errors', async () => {
    mock = installFetchMock([
      () => { throw new TypeError('network failure') },
    ])

    await expect(
      fetchWithRetry('https://example.com/x', {
        timeoutMs: 1000,
        timeoutMessage: 't',
        sleepFn: noSleep,
      }),
    ).rejects.toThrow('network failure')

    expect(mock!.calls.length).toBe(1)
  })
})
