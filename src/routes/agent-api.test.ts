import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { app } from '../app'
import { METHODOLOGY } from '../scoring/methodology'
import { scoreProject } from '../scoring/engine'
import type { Env, RawProjectData } from '../scoring/types'
import { providers } from '../providers/index'

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
    lastCommitDate: '2026-03-25T00:00:00.000Z',
    lastReleaseDate: '2026-03-20T00:00:00.000Z',
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
    lastCiRunDate: '2026-03-28T00:00:00.000Z',
    ciRunSuccessRate: 0.9,
    ciRunCount: 12,
    ciWorkflowRunSampleSize: 10,
    ciSamplingWindowDays: 30,
    ciDataSource: 'actions-runs',
    ...overrides,
  }
}

function createEnv(cacheKv: ReturnType<typeof createMockKV>): Env {
  const keyStore = new Map<string, string>([
    ['sk_pro', JSON.stringify({ tier: 'pro', name: 'pro-key', active: true })],
  ])

  return {
    CACHE_KV: cacheKv,
    KEYS_KV: {
      get: vi.fn(async (key: string, format?: string) => {
        const value = keyStore.get(key)
        if (!value) return null
        return format === 'json' ? JSON.parse(value) : value
      }),
    },
    RATE_LIMITER_ANON: { limit: vi.fn(async () => ({ success: true })) },
    RATE_LIMITER_AUTH: { limit: vi.fn(async () => ({ success: true })) },
    GITHUB_TOKEN: 'gh-token',
    PROVIDER_PIPELINE: { send: vi.fn(async () => {}) },
    RESULT_PIPELINE: { send: vi.fn(async () => {}) },
    USAGE_PIPELINE: { send: vi.fn(async () => {}) },
    MANIFEST_PIPELINE: { send: vi.fn(async () => {}) },
  } as unknown as Env
}

function seedRepoCache(cacheKv: ReturnType<typeof createMockKV>, result: ReturnType<typeof scoreProject>, storedAt: number) {
  const key = `isitalive:${METHODOLOGY.version}:github/${result.project.split('/')[1]}/${result.project.split('/')[2]}`
  cacheKv._store.set(key, JSON.stringify({ result, storedAt }))
}

describe('agent-ready health API', () => {
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

  it('returns methodology and drivers by default, with metrics opt-in on /api/check', async () => {
    const rawData = makeRawProjectData()
    const result = scoreProject(rawData, 'github')
    seedRepoCache(cacheKv, result, Date.now())
    const env = createEnv(cacheKv)

    const defaultCtx = makeExecutionCtx()
    const defaultRes = await app.fetch(
      new Request('https://isitalive.dev/api/check/github/owner/repo'),
      env,
      defaultCtx,
    )
    const defaultJson = await defaultRes.json() as any

    expect(defaultRes.status).toBe(200)
    expect(defaultJson.methodology.version).toBe(METHODOLOGY.version)
    expect(Array.isArray(defaultJson.drivers)).toBe(true)
    expect(defaultJson.metrics).toBeUndefined()

    const metricsCtx = makeExecutionCtx()
    const metricsRes = await app.fetch(
      new Request('https://isitalive.dev/api/check/github/owner/repo?include=metrics'),
      env,
      metricsCtx,
    )
    const metricsJson = await metricsRes.json() as any

    expect(metricsRes.status).toBe(200)
    expect(metricsJson.metrics.issueSampleSize).toBe(4)
    expect(metricsJson.metrics.prSampleLimit).toBe(20)

    await Promise.all([...defaultCtx.pending, ...metricsCtx.pending])
  })

  it('keeps manifest audits compact by default but still includes provenance fields', async () => {
    const rawData = makeRawProjectData()
    const staleResult = scoreProject(rawData, 'github')
    seedRepoCache(cacheKv, staleResult, Date.now() - (30 * 60 * 60 * 1000))
    const env = createEnv(cacheKv)

    const fetchSpy = vi.spyOn(providers.github, 'fetchProject').mockResolvedValue(rawData)
    const ctx = makeExecutionCtx()
    const response = await app.fetch(
      new Request('https://isitalive.dev/api/manifest', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer sk_pro',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          format: 'go.mod',
          content: 'module example.com/test\n\nrequire github.com/owner/repo v1.0.0\n',
        }),
      }),
      env,
      ctx,
    )
    const json = await response.json() as any

    expect(response.status).toBe(200)
    expect(fetchSpy).toHaveBeenCalledOnce()
    expect(json.methodology.version).toBe(METHODOLOGY.version)
    expect(json.dependencies[0].resolvedFrom).toBe('direct')
    expect(json.dependencies[0].checkedAt).toBeTruthy()
    expect(json.dependencies[0].methodology.version).toBe(METHODOLOGY.version)
    expect(json.dependencies[0].signals).toBeUndefined()
    expect(json.dependencies[0].drivers).toBeUndefined()
    expect(json.dependencies[0].metrics).toBeUndefined()

    await Promise.all(ctx.pending)
  })

  it('returns per-dependency signals, drivers, and metrics when requested on /api/manifest', async () => {
    const rawData = makeRawProjectData()
    const env = createEnv(cacheKv)
    vi.spyOn(providers.github, 'fetchProject').mockResolvedValue(rawData)

    const ctx = makeExecutionCtx()
    const response = await app.fetch(
      new Request('https://isitalive.dev/api/manifest?include=drivers,metrics,signals', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer sk_pro',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          format: 'go.mod',
          content: 'module example.com/test\n\nrequire github.com/owner/repo v1.0.0\n',
        }),
      }),
      env,
      ctx,
    )
    const json = await response.json() as any

    expect(response.status).toBe(200)
    expect(Array.isArray(json.dependencies[0].signals)).toBe(true)
    expect(Array.isArray(json.dependencies[0].drivers)).toBe(true)
    expect(json.dependencies[0].metrics.ciDataSource).toBe('actions-runs')

    await Promise.all(ctx.pending)
  })
})
