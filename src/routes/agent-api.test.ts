import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { app } from '../app'
import { METHODOLOGY } from '../scoring/methodology'
import { scoreProject } from '../scoring/engine'
import type { RawProjectData } from '../scoring/types'
import type { Env } from '../types/env'
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

async function drainExecutionCtx(ctx: ExecutionContext & { pending: Promise<unknown>[] }) {
  for (let i = 0; i < 3; i++) {
    await Promise.all(ctx.pending)
  }
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
    EVENT_QUEUE: { sendBatch: vi.fn(async () => {}) },
  } as unknown as Env
}

function seedRepoCache(cacheKv: ReturnType<typeof createMockKV>, result: ReturnType<typeof scoreProject>, storedAt: number) {
  const key = `isitalive:${METHODOLOGY.version}:github/${result.project.split('/')[1]}/${result.project.split('/')[2]}`
  cacheKv._store.set(key, JSON.stringify({ result, storedAt }))
}

function seedResponseCache(cacheApi: ReturnType<typeof createMockCacheApi>, path: string, body: unknown) {
  cacheApi._store.set(
    `https://cache.isitalive.dev/response/${METHODOLOGY.version}${path}`,
    Response.json(body),
  )
}

function stubNpmRegistry(body: unknown, status = 200) {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url.startsWith('https://registry.npmjs.org/')) {
      return Response.json(body, { status })
    }
    return new Response('unexpected fetch', { status: 500 })
  }))
}

function queuedDomainBatches(env: Env): string[][] {
  const sendBatch = vi.mocked((env as any).EVENT_QUEUE.sendBatch)
  return sendBatch.mock.calls.map((call: [Iterable<{ body: { domain: string } }>]) =>
    Array.from(call[0]).map((message) => message.body.domain),
  )
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

  it('uses the canonical l2-stale cache status on stale /api/check responses', async () => {
    const rawData = makeRawProjectData()
    const staleResult = scoreProject(rawData, 'github')
    seedRepoCache(cacheKv, staleResult, Date.now() - (30 * 60 * 60 * 1000))
    const env = createEnv(cacheKv)
    const fetchSpy = vi.spyOn(providers.github, 'fetchProject').mockResolvedValue(rawData)

    const ctx = makeExecutionCtx()
    const response = await app.fetch(
      new Request('https://isitalive.dev/api/check/github/owner/repo'),
      env,
      ctx,
    )
    const json = await response.json() as any

    expect(response.status).toBe(200)
    expect(json.cache.status).toBe('l2-stale')

    await Promise.all(ctx.pending)
    expect(fetchSpy).toHaveBeenCalledOnce()
  })

  it('emits only usage analytics for L1 response-cache hits', async () => {
    const env = createEnv(cacheKv)
    seedResponseCache(cacheApi, '/api/check/github/owner/repo', { score: 88, verdict: 'healthy' })

    const ctx = makeExecutionCtx()
    const response = await app.fetch(
      new Request('https://isitalive.dev/api/check/github/owner/repo'),
      env,
      ctx,
    )

    expect(response.status).toBe(200)
    await drainExecutionCtx(ctx)
    expect(queuedDomainBatches(env)).toEqual([['usage']])
  })

  it('emits only usage analytics for fresh L2 cache hits', async () => {
    const rawData = makeRawProjectData()
    const result = scoreProject(rawData, 'github')
    seedRepoCache(cacheKv, result, Date.now())
    const env = createEnv(cacheKv)

    const ctx = makeExecutionCtx()
    const response = await app.fetch(
      new Request('https://isitalive.dev/api/check/github/owner/repo'),
      env,
      ctx,
    )

    expect(response.status).toBe(200)
    await drainExecutionCtx(ctx)
    expect(queuedDomainBatches(env)).toEqual([['usage']])
  })

  it('separates stale cache-hit usage from revalidation score events', async () => {
    const rawData = makeRawProjectData()
    const staleResult = scoreProject(rawData, 'github')
    seedRepoCache(cacheKv, staleResult, Date.now() - (30 * 60 * 60 * 1000))
    const env = createEnv(cacheKv)
    vi.spyOn(providers.github, 'fetchProject').mockResolvedValue(rawData)

    const ctx = makeExecutionCtx()
    const response = await app.fetch(
      new Request('https://isitalive.dev/api/check/github/owner/repo'),
      env,
      ctx,
    )

    expect(response.status).toBe(200)
    await drainExecutionCtx(ctx)
    const batches = queuedDomainBatches(env)
    expect(batches).toContainEqual(['usage'])
    expect(batches).toContainEqual(['provider', 'result'])
    expect(batches).not.toContainEqual(['provider', 'result', 'usage'])
  })

  it('emits score-producing analytics on cache misses', async () => {
    const rawData = makeRawProjectData()
    const env = createEnv(cacheKv)
    vi.spyOn(providers.github, 'fetchProject').mockResolvedValue(rawData)

    const ctx = makeExecutionCtx()
    const response = await app.fetch(
      new Request('https://isitalive.dev/api/check/github/owner/repo'),
      env,
      ctx,
    )

    expect(response.status).toBe(200)
    await drainExecutionCtx(ctx)
    expect(queuedDomainBatches(env)).toContainEqual(['provider', 'result', 'usage'])
  })

  it('resolves npm packages through /api/resolve and applies API rate-limit headers', async () => {
    const env = createEnv(cacheKv)
    stubNpmRegistry({ repository: { url: 'https://github.com/facebook/react.git' } })

    const ctx = makeExecutionCtx()
    const response = await app.fetch(
      new Request('https://isitalive.dev/api/resolve/npm/react'),
      env,
      ctx,
    )
    const json = await response.json() as any

    expect(response.status).toBe(200)
    expect(response.headers.get('X-RateLimit-Limit')).toBe('5')
    expect(json).toEqual({
      package: { ecosystem: 'npm', name: 'react', version: '' },
      github: 'facebook/react',
      resolvedFrom: 'registry',
    })

    await Promise.all(ctx.pending)
  })

  it('normalizes npm package names before registry resolution', async () => {
    const env = createEnv(cacheKv)
    const fetchMock = vi.fn(async () => Response.json({
      repository: { url: 'https://github.com/facebook/react.git' },
    }))
    vi.stubGlobal('fetch', fetchMock)

    const ctx = makeExecutionCtx()
    const response = await app.fetch(
      new Request('https://isitalive.dev/api/resolve/npm/React'),
      env,
      ctx,
    )
    const json = await response.json() as any

    expect(response.status).toBe(200)
    expect(json.package.name).toBe('react')
    expect(fetchMock).toHaveBeenCalledWith(
      'https://registry.npmjs.org/react',
      expect.any(Object),
    )
  })

  it('checks npm packages through /api/check/package with metrics', async () => {
    const rawData = makeRawProjectData({ owner: 'facebook', name: 'react' })
    const env = createEnv(cacheKv)
    stubNpmRegistry({ repository: { url: 'https://github.com/facebook/react.git' } })
    vi.spyOn(providers.github, 'fetchProject').mockResolvedValue(rawData)

    const ctx = makeExecutionCtx()
    const response = await app.fetch(
      new Request('https://isitalive.dev/api/check/package/npm/react?include=metrics'),
      env,
      ctx,
    )
    const json = await response.json() as any

    expect(response.status).toBe(200)
    expect(response.headers.get('X-RateLimit-Limit')).toBe('5')
    expect(json.package).toEqual({ ecosystem: 'npm', name: 'react', version: '' })
    expect(json.github).toBe('facebook/react')
    expect(json.resolvedFrom).toBe('registry')
    expect(json.project).toBe('github/facebook/react')
    expect(json.metrics.issueSampleSize).toBe(4)

    await drainExecutionCtx(ctx)
  })

  it('supports scoped npm packages through query fallback', async () => {
    const env = createEnv(cacheKv)

    const ctx = makeExecutionCtx()
    const response = await app.fetch(
      new Request('https://isitalive.dev/api/resolve/npm?name=@types/node'),
      env,
      ctx,
    )
    const json = await response.json() as any

    expect(response.status).toBe(200)
    expect(json.package).toEqual({ ecosystem: 'npm', name: '@types/node', version: '' })
    expect(json.github).toBe('definitelytyped/definitelytyped')
    expect(json.resolvedFrom).toBe('direct')
  })

  it('supports Go module package paths', async () => {
    const env = createEnv(cacheKv)

    const ctx = makeExecutionCtx()
    const response = await app.fetch(
      new Request('https://isitalive.dev/api/resolve/go/golang.org/x/crypto'),
      env,
      ctx,
    )
    const json = await response.json() as any

    expect(response.status).toBe(200)
    expect(json.package).toEqual({ ecosystem: 'go', name: 'golang.org/x/crypto', version: '' })
    expect(json.github).toBe('golang/crypto')
    expect(json.resolvedFrom).toBe('vanity')
  })

  it('returns stable package route errors', async () => {
    const env = createEnv(cacheKv)

    const unsupported = await app.fetch(new Request('https://isitalive.dev/api/resolve/cargo/serde'), env, makeExecutionCtx())
    expect(unsupported.status).toBe(400)
    await expect(unsupported.json()).resolves.toMatchObject({ error_code: 'unsupported_ecosystem' })

    const missingName = await app.fetch(new Request('https://isitalive.dev/api/resolve/npm'), env, makeExecutionCtx())
    expect(missingName.status).toBe(400)
    await expect(missingName.json()).resolves.toMatchObject({ error_code: 'invalid_param' })

    const malformedScoped = await app.fetch(new Request('https://isitalive.dev/api/resolve/npm/@scope/a/b'), env, makeExecutionCtx())
    expect(malformedScoped.status).toBe(400)
    await expect(malformedScoped.json()).resolves.toMatchObject({ error_code: 'invalid_param' })

    const versionInName = await app.fetch(new Request('https://isitalive.dev/api/resolve/npm?name=react@18.2.0'), env, makeExecutionCtx())
    expect(versionInName.status).toBe(400)
    await expect(versionInName.json()).resolves.toMatchObject({ error_code: 'invalid_param' })

    const controlVersion = await app.fetch(new Request(`https://isitalive.dev/api/resolve/npm/react?version=${encodeURIComponent('1.0.0\nnext')}`), env, makeExecutionCtx())
    expect(controlVersion.status).toBe(400)
    await expect(controlVersion.json()).resolves.toMatchObject({ error_code: 'invalid_param' })

    const oversizedVersion = await app.fetch(new Request(`https://isitalive.dev/api/resolve/npm/react?version=${'x'.repeat(129)}`), env, makeExecutionCtx())
    expect(oversizedVersion.status).toBe(400)
    await expect(oversizedVersion.json()).resolves.toMatchObject({ error_code: 'invalid_param' })

    stubNpmRegistry({}, 404)
    const notFound = await app.fetch(new Request('https://isitalive.dev/api/resolve/npm/missing-package'), env, makeExecutionCtx())
    expect(notFound.status).toBe(404)
    await expect(notFound.json()).resolves.toMatchObject({ error_code: 'package_not_found' })

    stubNpmRegistry({})
    const noGithub = await app.fetch(new Request('https://isitalive.dev/api/resolve/npm/no-github'), env, makeExecutionCtx())
    expect(noGithub.status).toBe(404)
    await expect(noGithub.json()).resolves.toMatchObject({ error_code: 'no_github_repo' })

    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('registry down')
    }))
    const registryTimeout = await app.fetch(new Request('https://isitalive.dev/api/resolve/npm/timeout'), env, makeExecutionCtx())
    expect(registryTimeout.status).toBe(502)
    await expect(registryTimeout.json()).resolves.toMatchObject({ error_code: 'registry_timeout' })
  })

  it('routes human search inputs for packages and repos', async () => {
    const env = createEnv(cacheKv)
    const cases = [
      ['react', '/package/npm/react'],
      ['@types/node', '/package/npm/%40types/node'],
      ['https://www.npmjs.com/package/react', '/package/npm/react'],
      ['go:golang.org/x/crypto', '/package/go/golang.org/x/crypto'],
      ['facebook/react', '/github/facebook/react'],
    ]

    for (const [repo, location] of cases) {
      const response = await app.fetch(
        new Request('https://isitalive.dev/_check', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ repo }),
        }),
        env,
        makeExecutionCtx(),
      )
      expect(response.status).toBe(302)
      expect(response.headers.get('Location')).toBe(location)
    }
  })

  it('keeps manifest audits compact by default but still includes provenance fields', async () => {
    const rawData = makeRawProjectData()
    const staleResult = scoreProject(rawData, 'github')
    seedRepoCache(cacheKv, staleResult, Date.now() - (72 * 60 * 60 * 1000))
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

  it('audits lockfiles through /api/check/manifest with canonical agent fields', async () => {
    const rawData = makeRawProjectData({ owner: 'facebook', name: 'react' })
    const env = createEnv(cacheKv)
    stubNpmRegistry({ repository: { url: 'https://github.com/facebook/react.git' } })
    vi.spyOn(providers.github, 'fetchProject').mockResolvedValue(rawData)

    const ctx = makeExecutionCtx()
    const response = await app.fetch(
      new Request('https://isitalive.dev/api/check/manifest', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer sk_pro',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          format: 'package-lock.json',
          content: JSON.stringify({
            lockfileVersion: 3,
            packages: {
              '': { dependencies: { react: '^18.2.0' } },
              'node_modules/react': { version: '18.2.0' },
            },
          }),
        }),
      }),
      env,
      ctx,
    )
    const json = await response.json() as any

    expect(response.status).toBe(200)
    expect(response.headers.get('ETag')).toMatch(/^"[a-f0-9]{64}"$/)
    expect(json.format).toBe('package-lock.json')
    expect(json.dependencies[0]).toMatchObject({
      identity: {
        purl: 'pkg:npm/react@18.2.0',
        ecosystem: 'npm',
        name: 'react',
        version: '18.2.0',
        dependencyType: 'direct',
        sourceFormat: 'package-lock.json',
      },
      resolution: {
        provider: 'github',
        repo: 'facebook/react',
        source: 'registry',
        confidence: 'medium',
      },
      state: 'resolved',
      healthVerdict: 'healthy',
    })
    expect(json.dependencies[0].dataFreshness.checkedAt).toBeTruthy()
    expect(json.dependencies[0].riskFlags).toEqual([])

    await drainExecutionCtx(ctx)
  })

  it('checks mixed batch inputs and evaluates policy per dependency', async () => {
    const env = createEnv(cacheKv)
    stubNpmRegistry({ repository: { url: 'https://github.com/facebook/react.git' } })
    vi.spyOn(providers.github, 'fetchProject').mockImplementation(async (owner, repo) =>
      makeRawProjectData({ owner, name: repo }),
    )

    const ctx = makeExecutionCtx()
    const response = await app.fetch(
      new Request('https://isitalive.dev/api/check/batch', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer sk_pro',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          items: [
            { kind: 'package', ecosystem: 'npm', name: 'react', version: '18.2.0' },
            { kind: 'purl', purl: 'pkg:golang/golang.org/x/crypto' },
            { kind: 'github', owner: 'vercel', repo: 'next.js' },
            { kind: 'package', ecosystem: 'cargo', name: 'serde' },
          ],
          policy: {
            requireResolutionConfidence: 'high',
            failOnUnresolved: true,
          },
        }),
      }),
      env,
      ctx,
    )
    const json = await response.json() as any

    expect(response.status).toBe(200)
    expect(json.batchHash).toMatch(/^[a-f0-9]{64}$/)
    expect(json.results).toHaveLength(4)
    expect(json.dependencies).toHaveLength(4)
    expect(json.policyVerdict).toBe('fail')
    expect(json.results.some((dep: any) => dep.identity.purl === 'pkg:npm/react@18.2.0')).toBe(true)
    expect(json.results.some((dep: any) => dep.identity.purl === 'pkg:golang/golang.org/x/crypto')).toBe(true)
    expect(json.results.some((dep: any) => dep.identity.purl === 'pkg:github/vercel/next.js')).toBe(true)
    expect(json.results.find((dep: any) => dep.state === 'unsupported_ecosystem')).toMatchObject({
      score: null,
      verdict: 'unresolved',
      policy: { outcome: 'fail' },
    })
    expect(json.results.find((dep: any) => dep.identity.name === 'react').policy).toMatchObject({
      outcome: 'fail',
      reasons: ['resolution_confidence_below_high'],
    })

    await drainExecutionCtx(ctx)
  })

  it('requires authentication for batch checks', async () => {
    const env = createEnv(cacheKv)

    const response = await app.fetch(
      new Request('https://isitalive.dev/api/check/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: [] }),
      }),
      env,
      makeExecutionCtx(),
    )

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toMatchObject({ error: 'Authentication required' })
  })

  it('rejects policy score thresholds outside 0-100', async () => {
    const env = createEnv(cacheKv)

    const response = await app.fetch(
      new Request('https://isitalive.dev/api/check/batch', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer sk_pro',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          items: [],
          policy: { warnBelowScore: 101 },
        }),
      }),
      env,
      makeExecutionCtx(),
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      error_code: 'invalid_param',
      error: 'policy.warnBelowScore must be an integer between 0 and 100',
    })
  })

  it('rejects over-large batch requests before fanout', async () => {
    const env = createEnv(cacheKv)

    const response = await app.fetch(
      new Request('https://isitalive.dev/api/check/batch', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer sk_pro',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          items: Array.from({ length: 201 }, (_, i) => ({ kind: 'github', owner: 'owner', repo: `repo-${i}` })),
        }),
      }),
      env,
      makeExecutionCtx(),
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({ error_code: 'too_many_items' })
  })
})
