// ---------------------------------------------------------------------------
// Fuzz tests for CacheManager — property-based invariants
//
// NOTE: numRuns capped at 500 — each iteration creates a CacheManager,
// seeds mock KV, and performs async cache operations. The global FC_NUM_RUNS
// (10k in CI) would cause multi-minute timeouts.
// ---------------------------------------------------------------------------

import { describe, expect, vi, beforeEach, afterEach } from 'vitest'
import { test, fc } from '@fast-check/vitest'
import { CacheManager, TIERS, type Tier } from './index'
import type { ScoringResult, Env, Verdict } from '../scoring/types'

// Cap iterations — each iteration involves async mock KV ops that compound.
// At 500, cumulative overhead triggers Vitest worker timeouts on CI (~117s).
const CACHE_FUZZ_RUNS = { numRuns: 100 }

// ---------------------------------------------------------------------------
// Mocks — same pattern as cache-manager.test.ts
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
    delete: vi.fn(async () => false),
  }
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

const VALID_VERDICTS: Verdict[] = ['healthy', 'stable', 'degraded', 'critical', 'unmaintained']
const TIERS_LIST: Tier[] = ['free', 'pro', 'enterprise']

const tierArb = fc.constantFrom(...TIERS_LIST)

// GitHub-style owner/repo identifiers
const identArb = fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9._-]{0,20}$/)

const scoringResultArb: fc.Arbitrary<ScoringResult> = fc.record({
  project: fc.constant('github/test/test'),
  provider: fc.constant('github' as const),
  score: fc.integer({ min: 0, max: 100 }),
  verdict: fc.constantFrom(...VALID_VERDICTS),
  checkedAt: fc.constant(new Date().toISOString()),
  cached: fc.constant(false),
  signals: fc.constant([]),
})

// ---------------------------------------------------------------------------
// State management — shared mocks for property tests
// ---------------------------------------------------------------------------

let mockKV: ReturnType<typeof createMockKV>
let mockCache: ReturnType<typeof createMockCacheApi>
let env: Env
let ctx: ExecutionContext

beforeEach(() => {
  mockKV = createMockKV()
  mockCache = createMockCacheApi()
  env = { CACHE_KV: mockKV } as unknown as Env
  ctx = { waitUntil: vi.fn(), passThroughOnException: vi.fn() } as unknown as ExecutionContext
  vi.stubGlobal('caches', { default: mockCache })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// Helper — seed KV cache
// ---------------------------------------------------------------------------

function seedKV(provider: string, owner: string, repo: string, result: ScoringResult, storedAt: number) {
  const key = `isitalive:v2:${provider}/${owner.toLowerCase()}/${repo.toLowerCase()}`
  mockKV._store.set(key, {
    value: JSON.stringify({ result, storedAt }),
  })
}

// ---------------------------------------------------------------------------
// Fuzz properties
// ---------------------------------------------------------------------------

describe('CacheManager fuzz', () => {
  test.prop([identArb, identArb], CACHE_FUZZ_RUNS)(
    'key normalization: same logical repo regardless of casing',
    async (owner, repo) => {
      const result: ScoringResult = {
        project: `github/${owner}/${repo}`,
        provider: 'github',
        score: 50,
        verdict: 'stable',
        checkedAt: new Date().toISOString(),
        cached: false,
        signals: [],
      }

      const cm = new CacheManager(env, ctx)
      await cm.put('github', owner, repo, result)

      // Clear L1 to force L2 lookup
      mockCache._store.clear()

      // Read with different casing — may be l1-hit or hit depending on L1 state
      const upper = await cm.get('github', owner.toUpperCase(), repo.toUpperCase())
      const lower = await cm.get('github', owner.toLowerCase(), repo.toLowerCase())

      expect(['l1-hit', 'l2-hit']).toContain(upper.status)
      expect(['l1-hit', 'l2-hit']).toContain(lower.status)
      expect(upper.result!.score).toBe(lower.result!.score)
    },
  )

  test.prop([scoringResultArb, tierArb], CACHE_FUZZ_RUNS)(
    'put→get round-trip preserves score and verdict',
    async (result, tier) => {
      const cm = new CacheManager(env, ctx)
      await cm.put('github', 'owner', 'repo', result, tier)

      // Clear L1 to force L2 lookup
      mockCache._store.clear()

      const cached = await cm.get('github', 'owner', 'repo', tier)

      expect(cached.status).toBe('l2-hit')
      expect(cached.result!.score).toBe(result.score)
      expect(cached.result!.verdict).toBe(result.verdict)
      expect(cached.result!.cached).toBe(true) // cache flag set on read
    },
  )

  test.prop([scoringResultArb, tierArb], CACHE_FUZZ_RUNS)(
    'fresh entries always return hit status',
    async (result, tier) => {
      // Store 1 second ago — always fresh for any tier
      seedKV('github', 'test', 'repo', result, Date.now() - 1000)

      const cm = new CacheManager(env, ctx)
      // Clear L1 to test L2 path
      mockCache._store.clear()
      const cached = await cm.get('github', 'test', 'repo', tier)

      expect(cached.status).toBe('l2-hit')
      expect(cached.result).not.toBeNull()
    },
  )

  test.prop([scoringResultArb], CACHE_FUZZ_RUNS)(
    'entries stored beyond max staleTtl always return miss',
    async (result) => {
      // 100 days ago — beyond any tier's staleTtl
      const storedAt = Date.now() - (100 * 24 * 60 * 60 * 1000)
      seedKV('github', 'test', 'repo', result, storedAt)

      const cm = new CacheManager(env, ctx)
      mockCache._store.clear()

      for (const tier of TIERS_LIST) {
        const cached = await cm.get('github', 'test', 'repo', tier)
        expect(cached.status).toBe('l3-miss')
        expect(cached.result).toBeNull()
      }
    },
  )

  test.prop([scoringResultArb, tierArb], CACHE_FUZZ_RUNS)(
    'status transitions: hit → stale → miss as age increases',
    async (result, tier) => {
      const config = TIERS[tier]
      const cm = new CacheManager(env, ctx)

      // Fresh (half of freshTtl)
      const freshAge = Math.floor(config.freshTtl / 2) * 1000
      seedKV('github', 'a', 'b', result, Date.now() - freshAge)
      mockCache._store.clear()
      const fresh = await cm.get('github', 'a', 'b', tier)

      // Stale (midpoint between fresh and stale TTLs)
      const staleAge = Math.floor((config.freshTtl + config.staleTtl) / 2) * 1000
      seedKV('github', 'c', 'd', result, Date.now() - staleAge)
      mockCache._store.clear()
      const stale = await cm.get('github', 'c', 'd', tier)

      // Expired (double the staleTtl)
      const expiredAge = config.staleTtl * 2 * 1000
      seedKV('github', 'e', 'f', result, Date.now() - expiredAge)
      mockCache._store.clear()
      const expired = await cm.get('github', 'e', 'f', tier)

      expect(fresh.status).toBe('l2-hit')
      expect(stale.status).toBe('l2-stale')
      expect(expired.status).toBe('l3-miss')
    },
  )

  test.prop([scoringResultArb], CACHE_FUZZ_RUNS)(
    'higher tiers expire faster than lower tiers',
    async (result) => {
      // 2 hours ago — fresh for free, stale for pro, miss for enterprise
      const twoHoursAgo = Date.now() - (2 * 60 * 60 * 1000)
      const cm = new CacheManager(env, ctx)

      // Seed three separate repos to avoid L1 cross-pollution
      seedKV('github', 'free', 'test', result, twoHoursAgo)
      seedKV('github', 'pro', 'test', result, twoHoursAgo)
      seedKV('github', 'ent', 'test', result, twoHoursAgo)

      mockCache._store.clear()
      const free = await cm.get('github', 'free', 'test', 'free')
      mockCache._store.clear()
      const pro = await cm.get('github', 'pro', 'test', 'pro')
      mockCache._store.clear()
      const ent = await cm.get('github', 'ent', 'test', 'enterprise')

      // Free: 2h < 24h freshTtl → hit
      expect(free.status).toBe('l2-hit')
      // Pro: 2h > 1h freshTtl, < 6h staleTtl → stale
      expect(pro.status).toBe('l2-stale')
      // Enterprise: 2h > 1h staleTtl → miss
      expect(ent.status).toBe('l3-miss')
    },
  )

  test.prop([scoringResultArb, scoringResultArb], CACHE_FUZZ_RUNS)(
    'last write wins: second put overwrites first',
    async (result1, result2) => {
      const cm = new CacheManager(env, ctx)
      await cm.put('github', 'owner', 'repo', result1)
      await cm.put('github', 'owner', 'repo', result2)

      mockCache._store.clear()
      const cached = await cm.get('github', 'owner', 'repo')

      expect(cached.result!.score).toBe(result2.score)
      expect(cached.result!.verdict).toBe(result2.verdict)
    },
  )

  test.prop([fc.stringMatching(/^[a-z]{1,10}$/)], CACHE_FUZZ_RUNS)(
    'arbitrary provider names produce valid cache operations',
    async (provider) => {
      const result: ScoringResult = {
        project: `${provider}/test/test`,
        provider: 'github',
        score: 50,
        verdict: 'stable',
        checkedAt: new Date().toISOString(),
        cached: false,
        signals: [],
      }

      const cm = new CacheManager(env, ctx)
      await cm.put(provider, 'test', 'test', result)

      mockCache._store.clear()
      const cached = await cm.get(provider, 'test', 'test')

      expect(cached.status).toBe('l2-hit')
      expect(cached.result!.score).toBe(50)
    },
  )
})
