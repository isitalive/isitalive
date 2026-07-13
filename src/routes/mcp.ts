// ---------------------------------------------------------------------------
// /mcp — Model Context Protocol server (Streamable HTTP, JSON responses)
//
// Tools-only, stateless MCP server so AI agents can install IsItAlive as a
// first-class tool. JSON-RPC is hand-rolled — no SDK dependency, matching
// the rest of the Worker (no Octokit either).
//
// Transport notes (spec 2025-06-18, backwards compatible to 2024-11-05):
//   - POST /mcp with a JSON-RPC request  → single application/json response
//   - POST /mcp with a notification      → 202 Accepted, empty body
//   - GET/DELETE /mcp                    → 405 (no server-initiated streams,
//                                          no session state to delete)
//
// Auth mirrors the REST API: check_package / check_repo work anonymously,
// audit_manifest requires an API key or GitHub Actions OIDC token supplied
// as a normal Authorization: Bearer header on the POST.
// ---------------------------------------------------------------------------

import { Hono, type Context } from 'hono'
import type { Env } from '../types/env'
import type { Tier } from '../cache/index'
import type { OidcClaims } from '../github/oidc'
import { version } from '../../package.json'
import { CacheManager, trackFirstSeen } from '../cache/index'
import { providers, fetchAndScoreProject, scheduleRevalidation } from '../providers/index'
import { classifyError } from '../providers/errors'
import type { ScoringResult } from '../scoring/types'
import {
  normalizePackageName,
  normalizePackageVersion,
  packageResolutionProblem,
  parsePackageEcosystem,
  resolvePackageDependency,
  resolvedGithubSlug,
  SUPPORTED_PACKAGE_ECOSYSTEMS,
} from '../audit/packages'
import { parseManifest, type ManifestFormat } from '../audit/parsers'
import { resolveAll } from '../audit/resolver'
import { hashManifest, scoreAudit } from '../audit/scorer'
import { shapeAuditResult, shapeScoringResult, type IncludeFlags } from '../utils/healthResponse'
import { isValidParam } from '../utils/validate'
import { buildUsageEvent } from '../events/usage'
import { buildResultEvent } from '../events/result'
import { buildProviderEvent } from '../events/provider'
import { emitAll } from '../pipeline/emit'
import { readBodyWithByteLimit, RequestBodyTooLargeError } from '../utils/http'

type AppEnv = {
  Bindings: Env
  Variables: { tier: Tier; keyName: string | null; isAuthenticated: boolean; oidcClaims: OidcClaims | null }
}
type McpContext = Context<AppEnv>

const mcp = new Hono<AppEnv>()

// ---------------------------------------------------------------------------
// Protocol constants
// ---------------------------------------------------------------------------

const SUPPORTED_PROTOCOL_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05']
const LATEST_PROTOCOL_VERSION = '2025-06-18'

const PARSE_ERROR = -32700
const INVALID_REQUEST = -32600
const METHOD_NOT_FOUND = -32601
const INVALID_PARAMS = -32602
const INTERNAL_ERROR = -32603

const MAX_REQUEST_BODY_BYTES = 576 * 1024 // audit_manifest carries lockfile content
const MAX_MANIFEST_CONTENT_SIZE = 512 * 1024

const SERVER_INSTRUCTIONS = `IsItAlive scores open-source projects on 8 weighted maintenance signals and returns a 0-100 maintenance-health score with a verdict (healthy 80-100, stable 60-79, degraded 40-59, critical 20-39, unmaintained 0-19). It is a maintenance-risk signal, not a security, license, or compliance verdict.

Use check_package when you have a dependency name (npm, Go, or PyPI). Use check_repo when you already know the GitHub owner/repo. Use audit_manifest to score every dependency in a manifest or lockfile at once (requires an IsItAlive API key or GitHub Actions OIDC token sent as an Authorization: Bearer header). Archived repositories score 0 instantly.`

type JsonRpcId = string | number

interface JsonRpcMessage {
  jsonrpc?: unknown
  id?: unknown
  method?: unknown
  params?: unknown
  result?: unknown
  error?: unknown
}

function rpcResult(id: JsonRpcId, result: unknown) {
  return { jsonrpc: '2.0', id, result }
}

function rpcError(id: JsonRpcId | null, code: number, message: string, data?: unknown) {
  return { jsonrpc: '2.0', id, error: { code, message, ...(data !== undefined ? { data } : {}) } }
}

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

const READ_ONLY_ANNOTATIONS = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }

const TOOL_DEFINITIONS = [
  {
    name: 'check_package',
    title: 'Check package maintenance health',
    description: 'Resolve an npm, Go, or PyPI package to its GitHub repository and return the 0-100 maintenance-health score, verdict, signals, and drivers. Prefer this when you start from a dependency name.',
    inputSchema: {
      type: 'object',
      properties: {
        ecosystem: {
          type: 'string',
          enum: [...SUPPORTED_PACKAGE_ECOSYSTEMS],
          description: 'Package ecosystem: npm, go, or pypi.',
        },
        name: {
          type: 'string',
          description: 'Package name, e.g. react, @types/node, golang.org/x/crypto, or requests.',
        },
        version: {
          type: 'string',
          description: 'Optional version context echoed back in the response. Scoring is always repo-level.',
        },
        includeMetrics: {
          type: 'boolean',
          description: 'Include normalized raw measurements and sampling metadata.',
        },
      },
      required: ['ecosystem', 'name'],
      additionalProperties: false,
    },
    annotations: READ_ONLY_ANNOTATIONS,
  },
  {
    name: 'check_repo',
    title: 'Check GitHub repository maintenance health',
    description: 'Return the 0-100 maintenance-health score, verdict, signals, and drivers for a GitHub repository. Use when you already know the owner/repo.',
    inputSchema: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'GitHub owner or organization, e.g. vercel.' },
        repo: { type: 'string', description: 'Repository name, e.g. next.js.' },
        includeMetrics: {
          type: 'boolean',
          description: 'Include normalized raw measurements and sampling metadata.',
        },
      },
      required: ['owner', 'repo'],
      additionalProperties: false,
    },
    annotations: READ_ONLY_ANNOTATIONS,
  },
  {
    name: 'audit_manifest',
    title: 'Audit a dependency manifest or lockfile',
    description: 'Score every dependency in a manifest or lockfile and return per-dependency maintenance-health results plus an aggregate summary. Requires authentication (IsItAlive API key or GitHub Actions OIDC token in the Authorization header). If the response has complete=false, call again after retryAfterMs — the cache fills progressively.',
    inputSchema: {
      type: 'object',
      properties: {
        format: {
          type: 'string',
          enum: ['package.json', 'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'go.mod', 'go.sum', 'requirements.txt', 'pyproject.toml'],
          description: 'Manifest or lockfile format.',
        },
        content: { type: 'string', description: 'Raw manifest file content.' },
        include: {
          type: 'array',
          items: { type: 'string', enum: ['drivers', 'metrics', 'signals'] },
          description: 'Optional per-dependency detail to include.',
        },
      },
      required: ['format', 'content'],
      additionalProperties: false,
    },
    annotations: READ_ONLY_ANNOTATIONS,
  },
]

// ---------------------------------------------------------------------------
// Transport
// ---------------------------------------------------------------------------

mcp.post('/', async (c) => {
  c.header('Cache-Control', 'no-store')

  let parsed: unknown
  try {
    const raw = await readBodyWithByteLimit(c.req.raw, MAX_REQUEST_BODY_BYTES)
    parsed = JSON.parse(raw || '')
  } catch (err) {
    if (err instanceof RequestBodyTooLargeError) {
      return c.json(rpcError(null, INVALID_REQUEST, 'Request body too large'), 413)
    }
    return c.json(rpcError(null, PARSE_ERROR, 'Parse error: invalid JSON'), 400)
  }

  // JSON-RPC batches were removed in protocol 2025-06-18 but older clients
  // (2025-03-26 and earlier) may still send them.
  if (Array.isArray(parsed)) {
    if (parsed.length === 0) {
      return c.json(rpcError(null, INVALID_REQUEST, 'Invalid request: empty batch'), 400)
    }
    const responses = []
    for (const message of parsed) {
      const response = await handleMessage(c, message as JsonRpcMessage)
      if (response) responses.push(response)
    }
    if (responses.length === 0) return c.body(null, 202)
    return c.json(responses)
  }

  const response = await handleMessage(c, parsed as JsonRpcMessage)
  if (!response) return c.body(null, 202)
  return c.json(response)
})

// No server-initiated streams — clients open GET for SSE, which we don't offer.
mcp.get('/', (c) => {
  c.header('Allow', 'POST')
  return c.json(rpcError(null, INVALID_REQUEST, 'Method Not Allowed: this server uses JSON responses over POST only'), 405)
})

// Stateless server — there is no session to delete.
mcp.delete('/', (c) => {
  c.header('Allow', 'POST')
  return c.json(rpcError(null, INVALID_REQUEST, 'Method Not Allowed: stateless server, no session to delete'), 405)
})

// ---------------------------------------------------------------------------
// JSON-RPC dispatch
// ---------------------------------------------------------------------------

async function handleMessage(c: McpContext, message: JsonRpcMessage): Promise<object | null> {
  if (!message || typeof message !== 'object' || message.jsonrpc !== '2.0') {
    return rpcError(null, INVALID_REQUEST, 'Invalid request: expected a JSON-RPC 2.0 message')
  }

  // Client responses (results/errors for server-initiated requests) — we never
  // send requests, so acknowledge silently.
  if (message.method === undefined) return null

  if (typeof message.method !== 'string') {
    return rpcError(null, INVALID_REQUEST, 'Invalid request: method must be a string')
  }

  const hasId = typeof message.id === 'string' || typeof message.id === 'number'

  // Notifications (no id) require no response
  if (!hasId) return null

  const id = message.id as JsonRpcId
  const params = (message.params && typeof message.params === 'object' ? message.params : {}) as Record<string, unknown>

  try {
    switch (message.method) {
      case 'initialize':
        return rpcResult(id, handleInitialize(params))
      case 'ping':
        return rpcResult(id, {})
      case 'tools/list':
        return rpcResult(id, { tools: TOOL_DEFINITIONS })
      case 'tools/call':
        return await handleToolCall(c, id, params)
      default:
        return rpcError(id, METHOD_NOT_FOUND, `Method not found: ${message.method}`)
    }
  } catch (err) {
    console.error(JSON.stringify({
      level: 'error',
      msg: 'mcp_internal_error',
      method: message.method,
      message: err instanceof Error ? err.message : String(err),
    }))
    return rpcError(id, INTERNAL_ERROR, 'Internal error')
  }
}

function handleInitialize(params: Record<string, unknown>) {
  const requested = typeof params.protocolVersion === 'string' ? params.protocolVersion : ''
  const protocolVersion = SUPPORTED_PROTOCOL_VERSIONS.includes(requested)
    ? requested
    : LATEST_PROTOCOL_VERSION

  return {
    protocolVersion,
    capabilities: { tools: { listChanged: false } },
    serverInfo: { name: 'isitalive', title: 'Is It Alive?', version },
    instructions: SERVER_INSTRUCTIONS,
  }
}

// ---------------------------------------------------------------------------
// tools/call
// ---------------------------------------------------------------------------

type ToolOutcome = { payload: Record<string, unknown>; isError?: boolean }

async function handleToolCall(c: McpContext, id: JsonRpcId, params: Record<string, unknown>) {
  const name = typeof params.name === 'string' ? params.name : ''
  const args = (params.arguments && typeof params.arguments === 'object' ? params.arguments : {}) as Record<string, unknown>

  if (!TOOL_DEFINITIONS.some((tool) => tool.name === name)) {
    return rpcError(id, INVALID_PARAMS, `Unknown tool: ${name || '(missing name)'}`)
  }

  // Rate limit actual tool work (not the initialize/tools-list handshake) —
  // same budgets as the REST API, on a separate mcp: key space.
  const limited = await checkRateLimit(c)
  if (limited) return rpcResult(id, toolResult(limited))

  let outcome: ToolOutcome
  switch (name) {
    case 'check_package':
      outcome = await runCheckPackage(c, args)
      break
    case 'check_repo':
      outcome = await runCheckRepo(c, args)
      break
    case 'audit_manifest':
      outcome = await runAuditManifest(c, args)
      break
    default:
      return rpcError(id, INVALID_PARAMS, `Unknown tool: ${name}`)
  }

  return rpcResult(id, toolResult(outcome))
}

/** Shape a tool outcome per MCP: human-readable text + machine-readable structuredContent */
function toolResult(outcome: ToolOutcome) {
  return {
    content: [{ type: 'text', text: JSON.stringify(outcome.payload, null, 2) }],
    structuredContent: outcome.payload,
    isError: outcome.isError === true,
  }
}

function toolError(error: string, extra: Record<string, unknown> = {}): ToolOutcome {
  return { payload: { error, ...extra }, isError: true }
}

async function checkRateLimit(c: McpContext): Promise<ToolOutcome | null> {
  const isAuthenticated = c.get('isAuthenticated') ?? false
  const limiter = isAuthenticated ? c.env.RATE_LIMITER_AUTH : c.env.RATE_LIMITER_ANON
  if (!limiter || typeof limiter.limit !== 'function') return null

  const ip = c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for') ?? 'unknown'
  const key = isAuthenticated ? `mcp:key:${c.get('keyName')}` : `mcp:ip:${ip}`
  const { success } = await limiter.limit({ key })
  if (success) return null

  return toolError('Rate limit exceeded', {
    error_code: 'rate_limited',
    retryAfterSeconds: 60,
    hint: isAuthenticated
      ? 'Slow down: authenticated free access allows 50 tool calls/min.'
      : 'Anonymous access allows 5 tool calls/min. Send an IsItAlive API key as an Authorization: Bearer header for 50/min.',
  })
}

// ---------------------------------------------------------------------------
// Tool implementations — same cache/score pipeline as the REST endpoints
// ---------------------------------------------------------------------------

function includeFlagsFrom(args: Record<string, unknown>): IncludeFlags {
  const include = Array.isArray(args.include) ? args.include.map(String) : []
  return {
    drivers: include.includes('drivers'),
    metrics: include.includes('metrics') || args.includeMetrics === true,
    signals: include.includes('signals'),
  }
}

async function runCheckPackage(c: McpContext, args: Record<string, unknown>): Promise<ToolOutcome> {
  const ecosystem = typeof args.ecosystem === 'string' ? parsePackageEcosystem(args.ecosystem) : null
  if (!ecosystem) {
    return toolError(`Unsupported ecosystem. Supported: ${SUPPORTED_PACKAGE_ECOSYSTEMS.join(', ')}`, { error_code: 'unsupported_ecosystem' })
  }

  const name = typeof args.name === 'string' ? normalizePackageName(ecosystem, args.name) : null
  if (!name) {
    return toolError('Missing or invalid package name', { error_code: 'invalid_param' })
  }

  const version = normalizePackageVersion(typeof args.version === 'string' ? args.version : '')
  if (version === null) {
    return toolError('Invalid package version', { error_code: 'invalid_param' })
  }

  const resolved = await resolvePackageDependency(ecosystem, name, c.env, c.executionCtx, version)
  const github = resolvedGithubSlug(resolved.resolved)
  if (!github) {
    const problem = packageResolutionProblem(resolved.resolved.unresolvedReason)
    return toolError(problem.error, {
      error_code: problem.error_code,
      package: resolved.package,
      hint: problem.hint,
    })
  }

  const [owner, repo] = github.split('/')
  const scored = await scoreRepo(c, owner, repo, includeFlagsFrom(args))
  if (scored.isError) return scored

  return {
    payload: {
      package: resolved.package,
      github,
      resolvedFrom: resolved.resolved.resolvedFrom,
      ...scored.payload,
    },
  }
}

async function runCheckRepo(c: McpContext, args: Record<string, unknown>): Promise<ToolOutcome> {
  const rawOwner = typeof args.owner === 'string' ? args.owner : ''
  const rawRepo = typeof args.repo === 'string' ? args.repo : ''
  if (!isValidParam(rawOwner) || !isValidParam(rawRepo)) {
    return toolError('Invalid owner or repo name', { error_code: 'invalid_param' })
  }

  return scoreRepo(c, rawOwner.toLowerCase(), rawRepo.toLowerCase(), includeFlagsFrom(args))
}

async function scoreRepo(c: McpContext, owner: string, repo: string, flags: IncludeFlags): Promise<ToolOutcome> {
  const provider = 'github'
  if (!Object.hasOwn(providers, provider)) {
    return toolError(`Unsupported provider: ${provider}`, { error_code: 'unsupported_provider' })
  }

  const startTime = Date.now()
  const cacheManager = new CacheManager(c.env, c.executionCtx)

  try {
    const cached = await cacheManager.get(provider, owner, repo)
    let result: ScoringResult | null = cached.result
    let cacheStatus: string = cached.status

    if (cached.status === 'l2-stale' && cached.result) {
      c.executionCtx.waitUntil(scheduleRevalidation(c.env, c.executionCtx, provider, owner, repo))
    }

    if (!result) {
      const fresh = await fetchAndScoreProject(c.env, provider, owner, repo)
      result = fresh.result
      cacheStatus = 'l3-miss'
      c.executionCtx.waitUntil(Promise.all([
        cacheManager.put(provider, owner, repo, result),
        trackFirstSeen(c.env, provider, owner, repo),
        emitAll(c.env, {
          result: [buildResultEvent(result, 'mcp')],
          provider: [buildProviderEvent('github', owner, repo, fresh.rawData)],
        }),
      ]))
    }

    emitToolUsage(c, owner, repo, result, cacheStatus, startTime)
    return { payload: { ...shapeScoringResult(result, flags) } }
  } catch (err) {
    const errorCode = classifyError(err)
    if (errorCode !== 'not_found') {
      console.error(`MCP project fetch failed for ${provider}/${owner}/${repo}:`, err)
    }
    const messages: Record<string, string> = {
      not_found: 'Project not found',
      github_timeout: 'Upstream timed out — retry shortly',
      github_rate_limited: 'Upstream is rate-limited — retry shortly',
      github_circuit_open: 'Upstream temporarily unavailable — retry shortly',
      upstream_error: 'Failed to fetch project data',
    }
    return toolError(messages[errorCode] ?? 'Failed to fetch project data', { error_code: errorCode })
  }
}

async function runAuditManifest(c: McpContext, args: Record<string, unknown>): Promise<ToolOutcome> {
  const isAuthenticated = c.get('isAuthenticated') ?? false
  if (!isAuthenticated) {
    return toolError('Authentication required', {
      error_code: 'auth_required',
      hint: 'Manifest audits fan out to many dependency lookups. Send an IsItAlive API key or a public-repo GitHub Actions OIDC token as an Authorization: Bearer header on the MCP connection.',
    })
  }

  const format = typeof args.format === 'string' ? args.format : ''
  const content = typeof args.content === 'string' ? args.content : ''
  if (!format || !content) {
    return toolError('Missing required arguments: "format" and "content"', { error_code: 'invalid_param' })
  }

  if (content.length > MAX_MANIFEST_CONTENT_SIZE) {
    return toolError(`Content too large (${Math.round(content.length / 1024)}KB). Max: ${MAX_MANIFEST_CONTENT_SIZE / 1024}KB`, { error_code: 'content_too_large' })
  }

  let deps
  try {
    deps = parseManifest(format as ManifestFormat, content)
  } catch {
    return toolError('Invalid manifest format', { error_code: 'invalid_manifest' })
  }

  const contentHash = await hashManifest(content)
  if (deps.length === 0) {
    return { payload: { auditHash: contentHash, complete: true, format, scored: 0, total: 0, pending: 0, dependencies: [] } }
  }

  const resolved = await resolveAll(deps, c.env, c.executionCtx)
  const result = await scoreAudit(resolved, format, contentHash, c.env, c.executionCtx, {
    tier: c.get('tier') ?? 'free',
  })

  return { payload: { ...shapeAuditResult(result, includeFlagsFrom(args)) } }
}

/** Fire-and-forget usage analytics for MCP tool calls (source: 'mcp') */
function emitToolUsage(
  c: McpContext,
  owner: string,
  repo: string,
  result: ScoringResult,
  cacheStatus: string,
  startTime: number,
) {
  const oidcClaims = c.get('oidcClaims') ?? null
  c.executionCtx.waitUntil(
    buildUsageEvent(`${owner}/${repo}`, 'github', result.score, result.verdict, {
      source: 'mcp',
      apiKey: c.get('keyName') ?? 'anon',
      cacheStatus,
      responseTimeMs: Date.now() - startTime,
      cf: (c.req.raw as any).cf,
      userAgent: c.req.header('User-Agent') ?? null,
      clientHeader: c.req.header('X-IsItAlive-Client') ?? null,
      ip: null,
      oidcRepository: oidcClaims?.repository ?? null,
      oidcOwner: oidcClaims?.repository_owner ?? null,
    }).then((ue) => emitAll(c.env, { usage: [ue] })),
  )
}

export { mcp }
