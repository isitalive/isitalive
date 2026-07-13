import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { app } from '../app'
import { METHODOLOGY } from '../scoring/methodology'
import { scoreProject } from '../scoring/engine'
import type { RawProjectData } from '../scoring/types'
import type { Env } from '../types/env'
import { providers } from '../providers/index'

// Under vitest, 'workers-og' resolves to src/test-stubs/workers-og.ts via
// the config alias — the real package's wasm imports cannot load in Node.
// These bytes mirror STUB_PNG_BYTES there (PNG magic number).
const FAKE_PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47])

function createMockKV(initialEntries: Record<string, string> = {}) {
  const store = new Map<string, string>(Object.entries(initialEntries))
  return {
    _store: store,
    get: vi.fn(async (key: string, format?: string) => {
      const value = store.get(key)
      if (value == null) return null
      return format === 'json' ? JSON.parse(value) : value
    }),
    put: vi.fn(async (key: string, value: string) => {
      store.set(key, value)
    }),
    delete: vi.fn(async (key: string) => {
      store.delete(key)
    }),
    list: vi.fn(),
    getWithMetadata: vi.fn(),
  } as unknown as KVNamespace & { _store: Map<string, string> }
}

function createMockCacheApi() {
  const store = new Map<string, Response>()
  return {
    _store: store,
    match: vi.fn(async (request: Request) => store.get(request.url)?.clone()),
    put: vi.fn(async (request: Request, response: Response) => {
      store.set(request.url, response.clone())
    }),
    delete: vi.fn(async () => false),
  }
}

function makeExecutionCtx() {
  const pending: Promise<unknown>[] = []
  return {
    pending,
    waitUntil(promise: Promise<unknown>) {
      pending.push(promise.catch(() => {}))
    },
    passThroughOnException: vi.fn(),
    props: {},
  } as ExecutionContext & { pending: Promise<unknown>[] }
}

/** Relative dates keep scoring fixtures from decaying as wall-clock time passes */
function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
}

function makeRawProjectData(overrides: Partial<RawProjectData> = {}): RawProjectData {
  return {
    archived: false,
    name: 'repo',
    owner: 'owner',
    description: 'desc',
    stars: 100,
    forks: 10,
    defaultBranch: 'main',
    license: 'MIT',
    homepageUrl: null,
    language: 'TypeScript',
    languageColor: '#3178c6',
    lastCommitDate: daysAgoIso(3),
    lastReleaseDate: daysAgoIso(8),
    issueStalenessMedianDays: 2,
    issueSampleSize: 4,
    issueSampleLimit: 50,
    issueSamplingStrategy: 'median of the 50 most recently updated open issues',
    prResponsivenessMedianDays: 3,
    prSampleSize: 3,
    prSampleLimit: 20,
    prSamplingStrategy: 'median of the 20 most recently updated open pull requests',
    openIssueCount: 5,
    closedIssueCount: 20,
    openPrCount: 2,
    recentContributorCount: 3,
    contributorCommitSampleSize: 12,
    contributorWindowDays: 90,
    topContributorCommitShare: 0.5,
    hasCi: true,
    lastCiRunDate: daysAgoIso(1),
    ciRunSuccessRate: 0.9,
    ciRunCount: 12,
    ciWorkflowRunSampleSize: 10,
    ciSamplingWindowDays: 30,
    ciDataSource: 'actions-runs',
    ...overrides,
  }
}

function createEnv(cacheKv: ReturnType<typeof createMockKV>): Env {
  return {
    CACHE_KV: cacheKv,
    GITHUB_TOKEN: 'gh-token',
    EVENT_QUEUE: { sendBatch: vi.fn(async () => {}) },
  } as unknown as Env
}

function seedRepoCache(cacheKv: ReturnType<typeof createMockKV>, result: ReturnType<typeof scoreProject>, storedAt: number) {
  const key = `isitalive:${METHODOLOGY.version}:github/${result.project.split('/')[1]}/${result.project.split('/')[2]}`
  cacheKv._store.set(key, JSON.stringify({ result, storedAt }))
}

describe('/og/:provider/:owner/:repo.png', () => {
  let cacheKv: ReturnType<typeof createMockKV>
  let cacheApi: ReturnType<typeof createMockCacheApi>

  beforeEach(() => {
    cacheKv = createMockKV()
    cacheApi = createMockCacheApi()
    vi.stubGlobal('caches', { default: cacheApi })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('renders a PNG share card from the cached score', async () => {
    const result = scoreProject(makeRawProjectData(), 'github')
    seedRepoCache(cacheKv, result, Date.now())
    const env = createEnv(cacheKv)

    const ctx = makeExecutionCtx()
    const response = await app.fetch(
      new Request('https://isitalive.dev/og/github/owner/repo.png'),
      env,
      ctx,
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('image/png')
    expect(response.headers.get('CDN-Cache-Control')).toContain('s-maxage=86400')
    const bytes = new Uint8Array(await response.arrayBuffer())
    expect(Array.from(bytes)).toEqual(Array.from(FAKE_PNG))
    await Promise.all(ctx.pending)
  })

  it('normalizes owner/repo case and keeps dots in repo names', async () => {
    const result = scoreProject(makeRawProjectData({ owner: 'vercel', name: 'next.js' }), 'github')
    seedRepoCache(cacheKv, result, Date.now())
    const env = createEnv(cacheKv)

    const ctx = makeExecutionCtx()
    const response = await app.fetch(
      new Request('https://isitalive.dev/og/github/Vercel/Next.js.png'),
      env,
      ctx,
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('image/png')
    await Promise.all(ctx.pending)
  })

  it('rejects invalid params and unsupported providers', async () => {
    const env = createEnv(cacheKv)

    const badRepo = await app.fetch(
      new Request(`https://isitalive.dev/og/github/owner/${encodeURIComponent('re<po')}.png`),
      env,
      makeExecutionCtx(),
    )
    expect(badRepo.status).toBe(400)

    const badProvider = await app.fetch(
      new Request('https://isitalive.dev/og/gitlab/owner/repo.png'),
      env,
      makeExecutionCtx(),
    )
    expect(badProvider.status).toBe(400)
  })

  it('returns 503 without caching when scoring fails', async () => {
    const env = createEnv(cacheKv)
    vi.spyOn(providers.github, 'fetchProject').mockRejectedValue(new Error('github down'))
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const response = await app.fetch(
      new Request('https://isitalive.dev/og/github/owner/repo.png'),
      env,
      makeExecutionCtx(),
    )

    expect(response.status).toBe(503)
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=300')
    expect(errorSpy).toHaveBeenCalled()
  })

  it('serves repeat requests from the L1 response cache', async () => {
    const result = scoreProject(makeRawProjectData(), 'github')
    seedRepoCache(cacheKv, result, Date.now())
    const env = createEnv(cacheKv)

    const firstCtx = makeExecutionCtx()
    const first = await app.fetch(
      new Request('https://isitalive.dev/og/github/owner/repo.png'),
      env,
      firstCtx,
    )
    expect(first.status).toBe(200)
    await Promise.all(firstCtx.pending)

    // Remove the L2 entry — a hit now proves the response cache served it
    cacheKv._store.clear()

    const second = await app.fetch(
      new Request('https://isitalive.dev/og/github/owner/repo.png'),
      env,
      makeExecutionCtx(),
    )
    expect(second.status).toBe(200)
    expect(second.headers.get('Content-Type')).toBe('image/png')
  })
})
