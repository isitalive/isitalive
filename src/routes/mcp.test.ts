import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { app } from '../app'
import { METHODOLOGY } from '../scoring/methodology'
import { scoreProject } from '../scoring/engine'
import type { RawProjectData } from '../scoring/types'
import type { Env } from '../types/env'

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

function createEnv(cacheKv: ReturnType<typeof createMockKV>, overrides: Record<string, unknown> = {}): Env {
  const keyStore = new Map<string, string>([
    ['sk_test', JSON.stringify({ tier: 'free', name: 'test-key', active: true })],
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
    ...overrides,
  } as unknown as Env
}

function seedRepoCache(cacheKv: ReturnType<typeof createMockKV>, result: ReturnType<typeof scoreProject>, storedAt: number) {
  const key = `isitalive:${METHODOLOGY.version}:github/${result.project.split('/')[1]}/${result.project.split('/')[2]}`
  cacheKv._store.set(key, JSON.stringify({ result, storedAt }))
}

async function mcpRequest(env: Env, body: unknown, headers: Record<string, string> = {}) {
  const ctx = makeExecutionCtx()
  const response = await app.fetch(
    new Request('https://isitalive.dev/mcp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        ...headers,
      },
      body: JSON.stringify(body),
    }),
    env,
    ctx,
  )
  for (let i = 0; i < 3; i++) {
    await Promise.all(ctx.pending)
  }
  return response
}

describe('MCP server', () => {
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

  it('negotiates the initialize handshake', async () => {
    const env = createEnv(cacheKv)
    const response = await mcpRequest(env, {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-03-26',
        capabilities: {},
        clientInfo: { name: 'test-client', version: '1.0' },
      },
    })
    const json = await response.json() as any

    expect(response.status).toBe(200)
    expect(json.jsonrpc).toBe('2.0')
    expect(json.id).toBe(1)
    expect(json.result.protocolVersion).toBe('2025-03-26')
    expect(json.result.serverInfo.name).toBe('isitalive')
    expect(json.result.capabilities.tools).toBeDefined()
    expect(json.result.instructions).toContain('maintenance-health')
  })

  it('falls back to the latest supported protocol version', async () => {
    const env = createEnv(cacheKv)
    const response = await mcpRequest(env, {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2099-01-01' },
    })
    const json = await response.json() as any

    expect(json.result.protocolVersion).toBe('2025-06-18')
  })

  it('accepts notifications with a 202 and no body', async () => {
    const env = createEnv(cacheKv)
    const response = await mcpRequest(env, { jsonrpc: '2.0', method: 'notifications/initialized' })

    expect(response.status).toBe(202)
    expect(await response.text()).toBe('')
  })

  it('responds to ping', async () => {
    const env = createEnv(cacheKv)
    const response = await mcpRequest(env, { jsonrpc: '2.0', id: 'p1', method: 'ping' })
    const json = await response.json() as any

    expect(json.id).toBe('p1')
    expect(json.result).toEqual({})
  })

  it('lists the three read-only tools with input schemas', async () => {
    const env = createEnv(cacheKv)
    const response = await mcpRequest(env, { jsonrpc: '2.0', id: 2, method: 'tools/list' })
    const json = await response.json() as any

    const names = json.result.tools.map((tool: any) => tool.name)
    expect(names).toEqual(['check_package', 'check_repo', 'audit_manifest'])
    for (const tool of json.result.tools) {
      expect(tool.inputSchema.type).toBe('object')
      expect(tool.annotations.readOnlyHint).toBe(true)
      expect(typeof tool.description).toBe('string')
    }
  })

  it('checks a repo through tools/call using the shared cache pipeline', async () => {
    const result = scoreProject(makeRawProjectData(), 'github')
    seedRepoCache(cacheKv, result, Date.now())
    const env = createEnv(cacheKv)

    const response = await mcpRequest(env, {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: { name: 'check_repo', arguments: { owner: 'owner', repo: 'repo' } },
    })
    const json = await response.json() as any

    expect(response.status).toBe(200)
    expect(json.result.isError).toBe(false)
    expect(json.result.structuredContent.score).toBe(result.score)
    expect(json.result.structuredContent.verdict).toBe(result.verdict)
    expect(json.result.structuredContent.methodology.version).toBe(METHODOLOGY.version)
    expect(json.result.structuredContent.metrics).toBeUndefined()
    expect(JSON.parse(json.result.content[0].text).score).toBe(result.score)
  })

  it('includes metrics when requested', async () => {
    const result = scoreProject(makeRawProjectData(), 'github')
    seedRepoCache(cacheKv, result, Date.now())
    const env = createEnv(cacheKv)

    const response = await mcpRequest(env, {
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: { name: 'check_repo', arguments: { owner: 'owner', repo: 'repo', includeMetrics: true } },
    })
    const json = await response.json() as any

    expect(json.result.structuredContent.metrics).toBeDefined()
  })

  it('checks a package through tools/call with registry resolution', async () => {
    const result = scoreProject(makeRawProjectData({ owner: 'facebook', name: 'react' }), 'github')
    seedRepoCache(cacheKv, result, Date.now())
    const env = createEnv(cacheKv)
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.startsWith('https://registry.npmjs.org/')) {
        return Response.json({ repository: { url: 'https://github.com/facebook/react.git' } })
      }
      return new Response('unexpected fetch', { status: 500 })
    }))

    const response = await mcpRequest(env, {
      jsonrpc: '2.0',
      id: 5,
      method: 'tools/call',
      params: { name: 'check_package', arguments: { ecosystem: 'npm', name: 'react' } },
    })
    const json = await response.json() as any

    expect(json.result.isError).toBe(false)
    expect(json.result.structuredContent.package).toEqual({ ecosystem: 'npm', name: 'react', version: '' })
    expect(json.result.structuredContent.github).toBe('facebook/react')
    expect(json.result.structuredContent.score).toBe(result.score)
  })

  it('returns a tool error for unresolvable packages', async () => {
    const env = createEnv(cacheKv)
    vi.stubGlobal('fetch', vi.fn(async () => new Response('not found', { status: 404 })))

    const response = await mcpRequest(env, {
      jsonrpc: '2.0',
      id: 6,
      method: 'tools/call',
      params: { name: 'check_package', arguments: { ecosystem: 'pypi', name: 'missing-package' } },
    })
    const json = await response.json() as any

    expect(json.result.isError).toBe(true)
    expect(json.result.structuredContent.error_code).toBe('package_not_found')
  })

  it('rejects unsupported ecosystems as a tool error', async () => {
    const env = createEnv(cacheKv)

    const response = await mcpRequest(env, {
      jsonrpc: '2.0',
      id: 7,
      method: 'tools/call',
      params: { name: 'check_package', arguments: { ecosystem: 'cargo', name: 'serde' } },
    })
    const json = await response.json() as any

    expect(json.result.isError).toBe(true)
    expect(json.result.structuredContent.error_code).toBe('unsupported_ecosystem')
  })

  it('requires authentication for audit_manifest', async () => {
    const env = createEnv(cacheKv)

    const response = await mcpRequest(env, {
      jsonrpc: '2.0',
      id: 8,
      method: 'tools/call',
      params: {
        name: 'audit_manifest',
        arguments: { format: 'requirements.txt', content: 'requests==2.31.0\n' },
      },
    })
    const json = await response.json() as any

    expect(json.result.isError).toBe(true)
    expect(json.result.structuredContent.error_code).toBe('auth_required')
  })

  it('audits a manifest when authenticated', async () => {
    const result = scoreProject(makeRawProjectData({ owner: 'psf', name: 'requests' }), 'github')
    seedRepoCache(cacheKv, result, Date.now())
    const env = createEnv(cacheKv)
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.startsWith('https://pypi.org/pypi/')) {
        return Response.json({ info: { project_urls: { Source: 'https://github.com/psf/requests' } } })
      }
      return new Response('unexpected fetch', { status: 500 })
    }))

    const response = await mcpRequest(env, {
      jsonrpc: '2.0',
      id: 9,
      method: 'tools/call',
      params: {
        name: 'audit_manifest',
        arguments: { format: 'requirements.txt', content: 'requests==2.31.0\n' },
      },
    }, { Authorization: 'Bearer sk_test' })
    const json = await response.json() as any

    expect(json.result.isError).toBe(false)
    expect(json.result.structuredContent.total).toBe(1)
    expect(json.result.structuredContent.dependencies[0]).toMatchObject({
      name: 'requests',
      github: 'psf/requests',
    })
  })

  it('surfaces anonymous rate limits as tool errors with a hint', async () => {
    const env = createEnv(cacheKv, {
      RATE_LIMITER_ANON: { limit: vi.fn(async () => ({ success: false })) },
    })

    const response = await mcpRequest(env, {
      jsonrpc: '2.0',
      id: 10,
      method: 'tools/call',
      params: { name: 'check_repo', arguments: { owner: 'owner', repo: 'repo' } },
    })
    const json = await response.json() as any

    expect(json.result.isError).toBe(true)
    expect(json.result.structuredContent.error_code).toBe('rate_limited')
    expect(json.result.structuredContent.hint).toContain('API key')
  })

  it('does not rate limit the handshake', async () => {
    const anonLimit = vi.fn(async () => ({ success: false }))
    const env = createEnv(cacheKv, { RATE_LIMITER_ANON: { limit: anonLimit } })

    const init = await mcpRequest(env, { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } })
    const list = await mcpRequest(env, { jsonrpc: '2.0', id: 2, method: 'tools/list' })

    expect(init.status).toBe(200)
    expect(list.status).toBe(200)
    expect(anonLimit).not.toHaveBeenCalled()
  })

  it('returns JSON-RPC errors for unknown methods and tools', async () => {
    const env = createEnv(cacheKv)

    const unknownMethod = await mcpRequest(env, { jsonrpc: '2.0', id: 11, method: 'resources/list' })
    await expect(unknownMethod.json()).resolves.toMatchObject({ error: { code: -32601 } })

    const unknownTool = await mcpRequest(env, {
      jsonrpc: '2.0',
      id: 12,
      method: 'tools/call',
      params: { name: 'nonexistent_tool', arguments: {} },
    })
    await expect(unknownTool.json()).resolves.toMatchObject({ error: { code: -32602 } })
  })

  it('rejects invalid JSON with a parse error', async () => {
    const env = createEnv(cacheKv)
    const ctx = makeExecutionCtx()
    const response = await app.fetch(
      new Request('https://isitalive.dev/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{not json',
      }),
      env,
      ctx,
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({ error: { code: -32700 } })
  })

  it('handles JSON-RPC batches from older protocol clients', async () => {
    const env = createEnv(cacheKv)
    const response = await mcpRequest(env, [
      { jsonrpc: '2.0', id: 1, method: 'ping' },
      { jsonrpc: '2.0', method: 'notifications/initialized' },
      { jsonrpc: '2.0', id: 2, method: 'tools/list' },
    ])
    const json = await response.json() as any

    expect(Array.isArray(json)).toBe(true)
    expect(json).toHaveLength(2)
    expect(json[0].id).toBe(1)
    expect(json[1].result.tools).toHaveLength(3)
  })

  it('rejects GET and DELETE with 405', async () => {
    const env = createEnv(cacheKv)

    const get = await app.fetch(new Request('https://isitalive.dev/mcp'), env, makeExecutionCtx())
    expect(get.status).toBe(405)

    const del = await app.fetch(new Request('https://isitalive.dev/mcp', { method: 'DELETE' }), env, makeExecutionCtx())
    expect(del.status).toBe(405)
  })
})
