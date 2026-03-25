import { describe, expect, it, vi } from 'vitest'
import { trackFirstSeen, getFirstSeen } from './index'

// ── Mock KV ────────────────────────────────────────────────────────────
function createMockKV() {
  const store = new Map<string, string>()
  return {
    _store: store,
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    put: vi.fn(async (key: string, value: string) => {
      store.set(key, value)
    }),
  } as unknown as KVNamespace & { _store: Map<string, string> }
}

describe('trackFirstSeen', () => {
  it('calls get() then conditionally put()', async () => {
    const kv = createMockKV()
    await trackFirstSeen(kv, 'github', 'vercel', 'next.js')

    // Should check first, then write
    expect(kv.get).toHaveBeenCalledOnce()
    expect(kv.put).toHaveBeenCalledOnce()
  })

  it('does not overwrite an existing first-seen timestamp', async () => {
    const kv = createMockKV()
    const originalTs = '2024-01-01T00:00:00.000Z'
    kv._store.set('isitalive:first-seen:github/vercel/next.js', originalTs)

    await trackFirstSeen(kv, 'github', 'vercel', 'next.js')

    // Should read but NOT write (existing value preserved)
    expect(kv.get).toHaveBeenCalledOnce()
    expect(kv.put).not.toHaveBeenCalled()
    expect(kv._store.get('isitalive:first-seen:github/vercel/next.js')).toBe(originalTs)
  })

  it('stores an ISO-8601 timestamp', async () => {
    const kv = createMockKV()
    await trackFirstSeen(kv, 'github', 'vercel', 'next.js')

    const key = 'isitalive:first-seen:github/vercel/next.js'
    const value = kv._store.get(key)
    expect(value).toBeTruthy()
    expect(new Date(value!).toISOString()).toBe(value)
  })

  it('normalizes owner/repo to lowercase', async () => {
    const kv = createMockKV()
    await trackFirstSeen(kv, 'github', 'Vercel', 'Next.js')

    const key = 'isitalive:first-seen:github/vercel/next.js'
    expect(kv._store.has(key)).toBe(true)
  })

  it('sets expirationTtl of 1 year', async () => {
    const kv = createMockKV()
    await trackFirstSeen(kv, 'github', 'vercel', 'next.js')

    expect(kv.put).toHaveBeenCalledWith(
      'isitalive:first-seen:github/vercel/next.js',
      expect.any(String),
      { expirationTtl: 365 * 24 * 60 * 60 },
    )
  })
})

describe('getFirstSeen', () => {
  it('returns stored value for known repo', async () => {
    const kv = createMockKV()
    const ts = '2025-01-15T10:30:00.000Z'
    kv._store.set('isitalive:first-seen:github/vercel/next.js', ts)

    const result = await getFirstSeen(kv, 'github', 'vercel', 'next.js')
    expect(result).toBe(ts)
  })

  it('returns null for unknown repo', async () => {
    const kv = createMockKV()
    const result = await getFirstSeen(kv, 'github', 'unknown', 'repo')
    expect(result).toBeNull()
  })

  it('normalizes owner/repo to lowercase', async () => {
    const kv = createMockKV()
    kv._store.set('isitalive:first-seen:github/vercel/next.js', '2025-01-01T00:00:00.000Z')

    const result = await getFirstSeen(kv, 'github', 'Vercel', 'Next.js')
    expect(result).toBe('2025-01-01T00:00:00.000Z')
  })
})
