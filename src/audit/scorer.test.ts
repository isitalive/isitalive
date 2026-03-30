import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildSummary, hashManifest, scoreAudit, type AuditDep } from './scorer'
import type { RawProjectData } from '../scoring/types'
import type { Env } from '../types/env'
import { providers } from '../providers/index'
import type { ResolvedDep } from './resolver'

function makeDep(overrides: Partial<AuditDep> = {}): AuditDep {
  return {
    name: 'test-pkg',
    version: '1.0.0',
    dev: false,
    ecosystem: 'npm',
    github: 'owner/repo',
    score: 80,
    verdict: 'healthy',
    ...overrides,
  }
}

function makeResolvedDep(overrides: Partial<ResolvedDep> = {}): ResolvedDep {
  return {
    name: 'test-pkg',
    version: '1.0.0',
    dev: false,
    ecosystem: 'npm',
    github: { owner: 'owner', repo: 'repo' },
    resolvedFrom: 'registry',
    ...overrides,
  }
}

function makeRawProjectData(overrides: Partial<RawProjectData> = {}): RawProjectData {
  return {
    archived: false,
    name: 'repo',
    owner: 'owner',
    description: 'desc',
    stars: 1,
    forks: 1,
    defaultBranch: 'main',
    license: 'MIT',
    homepageUrl: null,
    language: 'TypeScript',
    languageColor: '#3178c6',
    lastCommitDate: '2026-03-01T00:00:00.000Z',
    lastReleaseDate: '2026-03-01T00:00:00.000Z',
    issueStalenessMedianDays: 1,
    prResponsivenessMedianDays: 1,
    openIssueCount: 1,
    closedIssueCount: 1,
    openPrCount: 1,
    recentContributorCount: 2,
    topContributorCommitShare: 0.5,
    hasCi: true,
    lastCiRunDate: '2026-03-01T00:00:00.000Z',
    ciRunSuccessRate: 1,
    ciRunCount: 5,
    ...overrides,
  }
}

function createMockKV(): KVNamespace & { _store: Map<string, string> } {
  const store = new Map<string, string>()
  return {
    _store: store,
    get: vi.fn(async (key: string, format?: string) => {
      const value = store.get(key)
      if (value == null) return null
      if (format === 'json') return JSON.parse(value)
      return value
    }),
    put: vi.fn(async (key: string, value: string) => {
      store.set(key, value)
    }),
    delete: vi.fn(async (key: string) => {
      store.delete(key)
    }),
    list: vi.fn(),
    getWithMetadata: vi.fn(),
  } as any
}

function createMockCacheApi() {
  const store = new Map<string, Response>()
  return {
    _store: store,
    match: vi.fn(async (request: Request) => store.get(request.url)?.clone()),
    put: vi.fn(async (request: Request, response: Response) => {
      store.set(request.url, response.clone())
    }),
    delete: vi.fn(),
  }
}

// ── buildSummary ───────────────────────────────────────────────────────
describe('buildSummary', () => {
  it('counts verdicts correctly', () => {
    const deps = [
      makeDep({ verdict: 'healthy', score: 90 }),
      makeDep({ verdict: 'healthy', score: 85 }),
      makeDep({ verdict: 'stable', score: 65 }),
      makeDep({ verdict: 'degraded', score: 45 }),
      makeDep({ verdict: 'critical', score: 25 }),
      makeDep({ verdict: 'unmaintained', score: 10 }),
    ]
    const summary = buildSummary(deps)
    expect(summary.healthy).toBe(2)
    expect(summary.stable).toBe(1)
    expect(summary.degraded).toBe(1)
    expect(summary.critical).toBe(1)
    expect(summary.unmaintained).toBe(1)
  })

  it('computes avgScore correctly', () => {
    const deps = [
      makeDep({ score: 90 }),
      makeDep({ score: 70 }),
      makeDep({ score: 50 }),
    ]
    const summary = buildSummary(deps)
    expect(summary.avgScore).toBe(70) // (90 + 70 + 50) / 3 = 70
  })

  it('rounds avgScore to integer', () => {
    const deps = [
      makeDep({ score: 33 }),
      makeDep({ score: 33 }),
      makeDep({ score: 34 }),
    ]
    const summary = buildSummary(deps)
    expect(Number.isInteger(summary.avgScore)).toBe(true)
  })

  it('returns 0 avgScore for empty array', () => {
    const summary = buildSummary([])
    expect(summary.avgScore).toBe(0)
    expect(summary.healthy).toBe(0)
    expect(summary.stable).toBe(0)
  })

  it('treats null scores as 0 in average', () => {
    const deps = [
      makeDep({ score: 100 }),
      makeDep({ score: null, verdict: 'unresolved' }),
    ]
    const summary = buildSummary(deps)
    expect(summary.avgScore).toBe(50) // (100 + 0) / 2
  })

  it('ignores unknown verdict values in counts', () => {
    const deps = [
      makeDep({ verdict: 'pending' }),
      makeDep({ verdict: 'unresolved' }),
      makeDep({ verdict: 'healthy', score: 90 }),
    ]
    const summary = buildSummary(deps)
    expect(summary.healthy).toBe(1)
    // pending and unresolved should not affect any count
    expect(summary.stable).toBe(0)
    expect(summary.degraded).toBe(0)
    expect(summary.critical).toBe(0)
    expect(summary.unmaintained).toBe(0)
  })
})

// ── hashManifest ───────────────────────────────────────────────────────
describe('hashManifest', () => {
  it('produces a deterministic hash', async () => {
    const content = '{"dependencies": {"hono": "^4.0.0"}}'
    const hash1 = await hashManifest(content)
    const hash2 = await hashManifest(content)
    expect(hash1).toBe(hash2)
  })

  it('produces different hashes for different content', async () => {
    const hash1 = await hashManifest('content-a')
    const hash2 = await hashManifest('content-b')
    expect(hash1).not.toBe(hash2)
  })

  it('produces a hex string (64 chars for SHA-256)', async () => {
    const hash = await hashManifest('test')
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('handles empty string', async () => {
    const hash = await hashManifest('')
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('scoreAudit background completion', () => {
  let cacheKv: ReturnType<typeof createMockKV>
  let env: Env
  let executionCtx: ExecutionContext & { pending: Promise<unknown>[] }

  beforeEach(() => {
    cacheKv = createMockKV()
    env = { CACHE_KV: cacheKv, GITHUB_TOKEN: 'gh-token' } as unknown as Env
    executionCtx = {
      pending: [],
      waitUntil(promise: Promise<unknown>) {
        this.pending.push(promise)
      },
      passThroughOnException: vi.fn(),
      props: {},
    } as ExecutionContext & { pending: Promise<unknown>[] }

    vi.stubGlobal('caches', { default: createMockCacheApi() })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('persists partial results immediately, then overwrites them with a complete cached result', async () => {
    const deps: ResolvedDep[] = [
      makeResolvedDep({ name: 'pkg-a', github: { owner: 'owner', repo: 'repo-a' } }),
      makeResolvedDep({ name: 'pkg-b', github: { owner: 'owner', repo: 'repo-b' } }),
    ]
    const fetchSpy = vi.spyOn(providers.github, 'fetchProject')
      .mockImplementation(async (_owner, repo) => makeRawProjectData({ name: repo, owner: 'owner' }))
    const contentHash = await hashManifest('manifest-content')

    const initial = await scoreAudit(deps, 'package.json', contentHash, env, executionCtx, -1)

    expect(initial.complete).toBe(false)
    const persistedInitial = JSON.parse(cacheKv._store.get(`audit:result:${contentHash}`)!)
    expect(persistedInitial.complete).toBe(false)
    expect(persistedInitial.pending).toBe(2)

    await Promise.all(executionCtx.pending)

    const finalJson = cacheKv._store.get(`audit:result:${contentHash}`)
    expect(finalJson).toBeTruthy()
    const final = JSON.parse(finalJson!)
    expect(final.complete).toBe(true)
    expect(final.pending).toBe(0)
    expect(final.dependencies.every((dep: AuditDep) => dep.verdict !== 'pending')).toBe(true)

    const second = await scoreAudit(deps, 'package.json', contentHash, env, executionCtx)
    expect(second.complete).toBe(true)
    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })
})
