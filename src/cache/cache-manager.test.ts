// ---------------------------------------------------------------------------
// Unit tests for CacheManager — 3-tier caching (L1: Cache API, L2: KV, SWR)
// ---------------------------------------------------------------------------

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { CacheManager, TIERS, type Tier } from './index'
import type { ScoringResult } from '../scoring/types'
import type { Env } from '../types/env'

// ---------------------------------------------------------------------------
// Helpers — minimal ScoringResult factory
// ---------------------------------------------------------------------------

function makeScoringResult(overrides: Partial<ScoringResult> = {}): ScoringResult {
  return {
    project: 'github/vercel/next.js',
    provider: 'github',
    score: 92,
    verdict: 'healthy',
    checkedAt: new Date().toISOString(),
    cached: false,
    signals: [],
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Mock KV namespace — in-memory Map with the KVNamespace interface subset
// ---------------------------------------------------------------------------

function createMockKV(): KVNamespace & { _store: Map<string, { value: string; ttl?: number }> } {
  const store = new Map<string, { value: string; ttl?: number }>()
  return {
    _store: store,
    get: vi.fn(async (key: string, format?: string) => {
      const entry = store.get(key)
      if (!entry) return null
      if (format === 'json') return JSON.parse(entry.value)
      return entry.value
    }),
    put: vi.fn(async (key: string, value: string, opts?: { expirationTtl?: number }) => {
      store.set(key, { value, ttl: opts?.expirationTtl })
    }),
    delete: vi.fn(async (key: string) => { store.delete(key) }),
    list: vi.fn(),
    getWithMetadata: vi.fn(),
  } as any
}

// ---------------------------------------------------------------------------
// Mock Cache API — in-memory Map keyed by URL string
// ---------------------------------------------------------------------------

function createMockCacheApi() {
  const store = new Map<string, Response>()
  return {
    _store: store,
    match: vi.fn(async (request: Request) => {
      const cached = store.get(request.url)
      return cached ? cached.clone() : undefined
    }),
    put: vi.fn(async (request: Request, response: Response) => {
      store.set(request.url, response.clone())
    }),
    delete: vi.fn(async (request: Request) => store.delete(request.url)),
  }
}

// ---------------------------------------------------------------------------
// Mock Env factory
// ---------------------------------------------------------------------------

function createMockEnv(kv: ReturnType<typeof createMockKV>): Env {
  return { CACHE_KV: kv } as unknown as Env
}

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

describe('CacheManager', () => {
  let mockKV: ReturnType<typeof createMockKV>
  let mockCache: ReturnType<typeof createMockCacheApi>
  let env: Env
  let ctx: ExecutionContext

  beforeEach(() => {
    mockKV = createMockKV()
    mockCache = createMockCacheApi()
    env = createMockEnv(mockKV)
    ctx = { waitUntil: vi.fn(), passThroughOnException: vi.fn() } as unknown as ExecutionContext

    // Stub the global caches.default
    vi.stubGlobal('caches', { default: mockCache })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  // ─── Helper: seed KV with a CachedEntry ──────────────────────────────
  function seedKV(provider: string, owner: string, repo: string, result: ScoringResult, storedAt: number) {
    const key = `isitalive:v2:${provider}/${owner.toLowerCase()}/${repo.toLowerCase()}`
    mockKV._store.set(key, {
      value: JSON.stringify({ result, storedAt }),
    })
  }

  // ─── Helper: seed L1 cache with a result ─────────────────────────────
  function seedL1(provider: string, owner: string, repo: string, result: ScoringResult) {
    const url = `https://cache.isitalive.dev/${provider}/${owner.toLowerCase()}/${repo.toLowerCase()}`
    const response = new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json' },
    })
    mockCache._store.set(url, response)
  }

  // ═══════════════════════════════════════════════════════════════════════
  // get() tests
  // ═══════════════════════════════════════════════════════════════════════

  describe('get()', () => {
    it('returns l1-hit when L1 cache has the result', async () => {
      const result = makeScoringResult()
      seedL1('github', 'vercel', 'next.js', result)

      const cm = new CacheManager(env, ctx)
      const cached = await cm.get('github', 'vercel', 'next.js')

      expect(cached.status).toBe('l1-hit')
      expect(cached.result).not.toBeNull()
      expect(cached.result!.cached).toBe(true)
      expect(cached.result!.score).toBe(92)
      // Metadata should be null for L1 hits
      expect(cached.ageSeconds).toBeNull()
      expect(cached.storedAt).toBeNull()
    })

    it('returns hit when KV entry is within freshTtl', async () => {
      const result = makeScoringResult()
      const storedAt = Date.now() - 1000 // 1 second ago (well within 24h)

      seedKV('github', 'vercel', 'next.js', result, storedAt)

      const cm = new CacheManager(env, ctx)
      const cached = await cm.get('github', 'vercel', 'next.js', 'free')

      expect(cached.status).toBe('l2-hit')
      expect(cached.result).not.toBeNull()
      expect(cached.result!.cached).toBe(true)
      expect(cached.ageSeconds).toBeGreaterThanOrEqual(0)
      expect(cached.storedAt).not.toBeNull()
      expect(cached.freshUntil).not.toBeNull()
      expect(cached.staleUntil).not.toBeNull()
    })

    it('promotes L2 hit to L1 on fresh read', async () => {
      const result = makeScoringResult()
      seedKV('github', 'vercel', 'next.js', result, Date.now() - 1000)

      const cm = new CacheManager(env, ctx)
      await cm.get('github', 'vercel', 'next.js')

      // putL1 should have been triggered (via waitUntil or direct)
      // Check that L1 cache now has the entry
      expect(ctx.waitUntil).toHaveBeenCalled()
    })

    it('returns stale when KV entry is between freshTtl and staleTtl', async () => {
      const result = makeScoringResult()
      // 30 hours ago: beyond 24h freshTtl for 'free', within 48h staleTtl
      const storedAt = Date.now() - (30 * 60 * 60 * 1000)

      seedKV('github', 'vercel', 'next.js', result, storedAt)

      const cm = new CacheManager(env, ctx)
      const cached = await cm.get('github', 'vercel', 'next.js', 'free')

      expect(cached.status).toBe('l2-stale')
      expect(cached.result).not.toBeNull()
      expect(cached.result!.cached).toBe(true)
      expect(cached.ageSeconds).toBeGreaterThan(TIERS.free.freshTtl)
    })

    it('returns miss when KV entry exceeds staleTtl', async () => {
      const result = makeScoringResult()
      // 72 hours ago: beyond 48h staleTtl for 'free'
      const storedAt = Date.now() - (72 * 60 * 60 * 1000)

      seedKV('github', 'vercel', 'next.js', result, storedAt)

      const cm = new CacheManager(env, ctx)
      const cached = await cm.get('github', 'vercel', 'next.js', 'free')

      expect(cached.status).toBe('l3-miss')
      expect(cached.result).toBeNull()
      expect(cached.ageSeconds).not.toBeNull() // still reports age
    })

    it('returns miss with null metadata when KV is empty', async () => {
      const cm = new CacheManager(env, ctx)
      const cached = await cm.get('github', 'vercel', 'next.js')

      expect(cached.status).toBe('l3-miss')
      expect(cached.result).toBeNull()
      expect(cached.ageSeconds).toBeNull()
      expect(cached.storedAt).toBeNull()
      expect(cached.freshUntil).toBeNull()
      expect(cached.staleUntil).toBeNull()
    })

    it('applies tier-specific TTLs — same entry is fresh for free but stale for pro', async () => {
      const result = makeScoringResult()
      // 2 hours ago: within 24h free freshTtl, but beyond 1h pro freshTtl
      const storedAt = Date.now() - (2 * 60 * 60 * 1000)

      seedKV('github', 'vercel', 'next.js', result, storedAt)

      const cm = new CacheManager(env, ctx)

      const freeCached = await cm.get('github', 'vercel', 'next.js', 'free')
      expect(freeCached.status).toBe('l2-hit')

      // Reset L1 so it doesn't short-circuit the pro lookup
      mockCache._store.clear()

      const proCached = await cm.get('github', 'vercel', 'next.js', 'pro')
      expect(proCached.status).toBe('l2-stale')
    })

    it('normalizes owner/repo to lowercase for key lookup', async () => {
      const result = makeScoringResult()
      seedKV('github', 'vercel', 'next.js', result, Date.now())

      const cm = new CacheManager(env, ctx)
      const cached = await cm.get('github', 'Vercel', 'Next.js')

      expect(cached.status).toBe('l2-hit')
      expect(cached.result!.score).toBe(92)
    })

    it('gracefully falls through to L2 when Cache API throws', async () => {
      mockCache.match = vi.fn(async () => { throw new Error('Cache API offline') })
      const result = makeScoringResult()
      seedKV('github', 'vercel', 'next.js', result, Date.now())

      const cm = new CacheManager(env, ctx)
      const cached = await cm.get('github', 'vercel', 'next.js')

      expect(cached.status).toBe('l2-hit')
      expect(cached.result!.score).toBe(92)
    })
  })

  // ═══════════════════════════════════════════════════════════════════════
  // put() tests
  // ═══════════════════════════════════════════════════════════════════════

  describe('put()', () => {
    it('writes to KV with correct key and shape', async () => {
      const result = makeScoringResult()
      const cm = new CacheManager(env, ctx)

      await cm.put('github', 'vercel', 'next.js', result)

      const kvEntry = mockKV._store.get('isitalive:v2:github/vercel/next.js')
      expect(kvEntry).toBeDefined()
      const parsed = JSON.parse(kvEntry!.value)
      expect(parsed.result.score).toBe(92)
      expect(parsed.storedAt).toBeGreaterThan(0)
    })

    it('sets KV expirationTtl to 48 hours', async () => {
      const result = makeScoringResult()
      const cm = new CacheManager(env, ctx)

      await cm.put('github', 'vercel', 'next.js', result)

      expect(mockKV.put).toHaveBeenCalledWith(
        'isitalive:v2:github/vercel/next.js',
        expect.any(String),
        { expirationTtl: 48 * 60 * 60 },
      )
    })

    it('uses waitUntil for background writes when ctx is provided', async () => {
      const result = makeScoringResult()
      const cm = new CacheManager(env, ctx)

      await cm.put('github', 'vercel', 'next.js', result)

      expect(ctx.waitUntil).toHaveBeenCalled()
    })

    it('awaits writes directly when no ctx is provided', async () => {
      const result = makeScoringResult()
      const cm = new CacheManager(env) // no ctx

      await cm.put('github', 'vercel', 'next.js', result)

      // KV should still have the entry (awaited directly)
      const kvEntry = mockKV._store.get('isitalive:v2:github/vercel/next.js')
      expect(kvEntry).toBeDefined()
    })

    it('round-trips: put then get returns the same result', async () => {
      const result = makeScoringResult({ score: 73, verdict: 'stable' })
      const cm = new CacheManager(env, ctx)

      await cm.put('github', 'facebook', 'react', result)

      // Clear L1 to force L2 lookup
      mockCache._store.clear()

      const cached = await cm.get('github', 'facebook', 'react')
      expect(cached.status).toBe('l2-hit')
      expect(cached.result!.score).toBe(73)
      expect(cached.result!.verdict).toBe('stable')
    })
  })

  // ═══════════════════════════════════════════════════════════════════════
  // getResponse() tests
  // ═══════════════════════════════════════════════════════════════════════

  describe('getResponse()', () => {
    it('returns cached response for anonymous requests', async () => {
      const req = new Request('https://isitalive.dev/api/check/github/vercel/next.js')
      const response = new Response(JSON.stringify({ score: 92 }), {
        headers: { 'Content-Type': 'application/json' },
      })
      mockCache._store.set(req.url, response)

      const cm = new CacheManager(env, ctx)
      const cached = await cm.getResponse(req, false)

      expect(cached).not.toBeNull()
      const body = await cached!.json() as { score: number }
      expect(body.score).toBe(92)
    })

    it('returns null for authenticated requests (bypasses cache)', async () => {
      const req = new Request('https://isitalive.dev/api/check/github/vercel/next.js')
      mockCache._store.set(req.url, new Response('cached'))

      const cm = new CacheManager(env, ctx)
      const cached = await cm.getResponse(req, true)

      expect(cached).toBeNull()
    })

    it('returns null on cache miss', async () => {
      const req = new Request('https://isitalive.dev/api/check/github/vercel/next.js')

      const cm = new CacheManager(env, ctx)
      const cached = await cm.getResponse(req, false)

      expect(cached).toBeNull()
    })

    it('returns null when Cache API throws', async () => {
      mockCache.match = vi.fn(async () => { throw new Error('offline') })
      const req = new Request('https://isitalive.dev/api/check/github/vercel/next.js')

      const cm = new CacheManager(env, ctx)
      const cached = await cm.getResponse(req, false)

      expect(cached).toBeNull()
    })

    it('returns a response with mutable headers (regression: immutable Cache API headers)', async () => {
      // Cache API responses have immutable headers — Hono secureHeaders
      // middleware must be able to modify them without throwing TypeError.
      const req = new Request('https://isitalive.dev/api/check/github/vercel/next.js')
      const response = new Response(JSON.stringify({ score: 92 }), {
        headers: { 'Content-Type': 'application/json' },
      })
      mockCache._store.set(req.url, response)

      const cm = new CacheManager(env, ctx)
      const cached = await cm.getResponse(req, false)

      expect(cached).not.toBeNull()
      // This must not throw — it would in production if we returned the
      // raw Cache API response without creating a mutable copy.
      expect(() => {
        cached!.headers.set('X-Test-Mutable', 'yes')
      }).not.toThrow()
      expect(cached!.headers.get('X-Test-Mutable')).toBe('yes')
    })
  })

  // ═══════════════════════════════════════════════════════════════════════
  // putResponse() tests
  // ═══════════════════════════════════════════════════════════════════════

  describe('putResponse()', () => {
    it('caches a cloned response', async () => {
      const req = new Request('https://isitalive.dev/api/check/github/vercel/next.js')
      const response = new Response(JSON.stringify({ score: 92 }))

      const cm = new CacheManager(env, ctx)
      await cm.putResponse(req, response)

      expect(mockCache.put).toHaveBeenCalled()
    })

    it('uses waitUntil when ctx is provided', async () => {
      const req = new Request('https://isitalive.dev/api/check/github/vercel/next.js')
      const response = new Response('test')

      const cm = new CacheManager(env, ctx)
      await cm.putResponse(req, response)

      expect(ctx.waitUntil).toHaveBeenCalled()
    })

    it('awaits directly when no ctx is provided', async () => {
      const req = new Request('https://isitalive.dev/api/check/github/vercel/next.js')
      const response = new Response('test')

      const cm = new CacheManager(env) // no ctx
      await cm.putResponse(req, response)

      expect(mockCache.put).toHaveBeenCalled()
    })
  })
})
