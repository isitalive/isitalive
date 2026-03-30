import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchAndScoreProject, scheduleRevalidation, providers } from './index'
import type { RawProjectData } from '../scoring/types'
import type { Env } from '../types/env'

function createMockKV(): KVNamespace & { _store: Map<string, string> } {
  const store = new Map<string, string>()
  return {
    _store: store,
    get: vi.fn(async (key: string) => store.get(key) ?? null),
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
    match: vi.fn(async (request: Request) => store.get(request.url)?.clone()),
    put: vi.fn(async (request: Request, response: Response) => {
      store.set(request.url, response.clone())
    }),
    delete: vi.fn(),
  }
}

function makeRawProjectData(overrides: Partial<RawProjectData> = {}): RawProjectData {
  return {
    archived: false,
    name: 'next.js',
    owner: 'vercel',
    description: 'Next.js',
    stars: 1,
    forks: 1,
    defaultBranch: 'main',
    license: 'MIT',
    homepageUrl: null,
    language: 'TypeScript',
    languageColor: '#3178c6',
    lastCommitDate: new Date().toISOString(),
    lastReleaseDate: new Date().toISOString(),
    issueStalenessMedianDays: 1,
    prResponsivenessMedianDays: 1,
    openIssueCount: 1,
    closedIssueCount: 1,
    openPrCount: 1,
    recentContributorCount: 2,
    topContributorCommitShare: 0.5,
    hasCi: true,
    lastCiRunDate: new Date().toISOString(),
    ciRunSuccessRate: 1,
    ciRunCount: 10,
    ...overrides,
  }
}

describe('provider hot-path dedupe', () => {
  let cacheKv: ReturnType<typeof createMockKV>
  let env: Env
  let executionCtx: ExecutionContext

  beforeEach(() => {
    cacheKv = createMockKV()
    env = {
      CACHE_KV: cacheKv,
      GITHUB_TOKEN: 'gh-token',
      PROVIDER_PIPELINE: { send: vi.fn(async () => {}) },
      RESULT_PIPELINE: { send: vi.fn(async () => {}) },
    } as unknown as Env
    executionCtx = {
      waitUntil: vi.fn(),
      passThroughOnException: vi.fn(),
      props: {},
    } as ExecutionContext

    vi.stubGlobal('caches', { default: createMockCacheApi() })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('coalesces concurrent repo score misses in-process', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const fetchSpy = vi.spyOn(providers.github, 'fetchProject').mockImplementation(async () => {
      await gate
      return makeRawProjectData()
    })

    const first = fetchAndScoreProject(env, 'github', 'vercel', 'next.js')
    const second = fetchAndScoreProject(env, 'github', 'vercel', 'next.js')

    release()
    const [left, right] = await Promise.all([first, second])

    expect(fetchSpy).toHaveBeenCalledOnce()
    expect(left.result.score).toBe(right.result.score)
  })

  it('leases stale revalidation so only one background refresh is scheduled', async () => {
    const fetchSpy = vi.spyOn(providers.github, 'fetchProject').mockResolvedValue(makeRawProjectData())

    const first = await scheduleRevalidation(env, executionCtx, 'github', 'vercel', 'next.js')
    const second = await scheduleRevalidation(env, executionCtx, 'github', 'vercel', 'next.js')

    expect(first).toBe(true)
    expect(second).toBe(false)
    expect(executionCtx.waitUntil).toHaveBeenCalledOnce()

    const [scheduled] = (executionCtx.waitUntil as any).mock.calls[0]
    await scheduled

    expect(fetchSpy).toHaveBeenCalledOnce()
  })
})
