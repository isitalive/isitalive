import { Hono } from 'hono'
import type { Env } from '../types/env'
import type { Tier } from '../cache/index'
import { resolveAll, type ResolvedDep } from '../audit/resolver'
import { hashManifest, scoreAudit } from '../audit/scorer'
import { parseAuditRequestOptions } from '../audit/requestOptions'
import { parseSupportedPurl } from '../audit/agent'
import {
  makePackageDep,
  normalizePackageName,
  normalizePackageVersion,
  parsePackageEcosystem,
} from '../audit/packages'
import type { ParsedDep, ParsedEcosystem } from '../audit/parsers'
import { readBodyWithByteLimit, RequestBodyTooLargeError } from '../utils/http'
import { isValidParam } from '../utils/validate'
import { parseIncludeFlags, shapeAuditResult } from '../utils/healthResponse'

type AppEnv = { Bindings: Env; Variables: { tier: Tier; keyName: string | null; isAuthenticated: boolean } }

const batch = new Hono<AppEnv>()
const MAX_REQUEST_BODY_BYTES = 576 * 1024
const MAX_BATCH_ITEMS = 200

type BatchItem =
  | { kind: 'package'; ecosystem?: unknown; name?: unknown; version?: unknown }
  | { kind: 'purl'; purl?: unknown }
  | { kind: 'github'; owner?: unknown; repo?: unknown; version?: unknown }

batch.post('/', async (c) => {
  const isAuthenticated = c.get('isAuthenticated') ?? false
  if (!isAuthenticated) {
    return c.json({
      error: 'Authentication required',
      hint: 'Batch checks require authenticated free access because one request can fan out to many dependency lookups.',
    }, 401)
  }

  let rawBody: string
  let body: { items?: unknown; policy?: unknown; maxAgeSeconds?: unknown; preferFresh?: unknown }
  try {
    rawBody = await readBodyWithByteLimit(c.req.raw, MAX_REQUEST_BODY_BYTES)
    body = JSON.parse(rawBody || '{}')
  } catch (err) {
    if (err instanceof RequestBodyTooLargeError) {
      return c.json({ error: 'Payload too large', error_code: 'payload_too_large' }, 413)
    }
    return c.json({ error: 'Invalid JSON body', error_code: 'invalid_json' }, 400)
  }

  if (!Array.isArray(body.items)) {
    return c.json({ error: 'Missing required field: "items"', error_code: 'invalid_param' }, 400)
  }

  if (body.items.length > MAX_BATCH_ITEMS) {
    return c.json({ error: `Too many items. Max: ${MAX_BATCH_ITEMS}`, error_code: 'too_many_items' }, 400)
  }

  const optionResult = parseAuditRequestOptions(body as Record<string, unknown>)
  if (optionResult.error) {
    return c.json({ error: optionResult.error.message, error_code: optionResult.error.error_code }, 400)
  }

  const normalized = normalizeBatchItems(body.items as BatchItem[])
  const resolved = [
    ...(await resolveAll(normalized.toResolve, c.env, c.executionCtx)),
    ...normalized.resolved,
  ]

  const batchHash = await hashManifest(rawBody)
  const result = await scoreAudit(
    resolved,
    'batch',
    batchHash,
    c.env,
    c.executionCtx,
    {
      tier: c.get('tier') ?? 'free',
      ...optionResult.options,
    },
  )

  const shaped = shapeAuditResult(result, parseIncludeFlags(c.req.url))
  const response = c.json({
    ...shaped,
    batchHash,
    results: shaped.dependencies,
  })
  response.headers.set('ETag', `"${batchHash}"`)
  if (!result.complete && result.retryAfterMs) {
    response.headers.set('Retry-After', String(Math.ceil(result.retryAfterMs / 1000)))
  }
  return response
})

function normalizeBatchItems(items: BatchItem[]): { toResolve: ParsedDep[]; resolved: ResolvedDep[] } {
  const toResolve: ParsedDep[] = []
  const resolved: ResolvedDep[] = []

  for (const item of items) {
    if (!item || typeof item !== 'object') {
      resolved.push(unsupportedDep('invalid_item', '', 'unsupported_ecosystem'))
      continue
    }

    if (item.kind === 'package') {
      const ecosystem = typeof item.ecosystem === 'string' ? parsePackageEcosystem(item.ecosystem) : null
      if (!ecosystem) {
        resolved.push(unsupportedDep(typeof item.name === 'string' ? item.name : 'unsupported-package', '', 'unsupported_ecosystem'))
        continue
      }
      const name = typeof item.name === 'string' ? normalizePackageName(ecosystem, item.name) : null
      const version = typeof item.version === 'string' ? normalizePackageVersion(item.version) : ''
      if (!name || version === null) {
        resolved.push(unsupportedDep(typeof item.name === 'string' ? item.name : 'invalid-package', '', 'invalid_param'))
        continue
      }
      toResolve.push(makePackageDep(ecosystem, name, version))
      continue
    }

    if (item.kind === 'purl') {
      if (typeof item.purl !== 'string') {
        resolved.push(unsupportedDep('invalid-purl', '', 'invalid_purl'))
        continue
      }
      const parsed = parseSupportedPurl(item.purl)
      if (!parsed) {
        resolved.push(unsupportedDep(item.purl, '', 'unsupported_ecosystem'))
        continue
      }
      if (parsed.ecosystem === 'github') {
        const direct = githubDep(parsed.name, parsed.version)
        if (direct) resolved.push(direct)
        else resolved.push(unsupportedDep(parsed.name, parsed.version, 'invalid_github_repo'))
        continue
      }
      const ecosystem = parsePackageEcosystem(parsed.ecosystem)
      const name = ecosystem ? normalizePackageName(ecosystem, parsed.name) : null
      const version = normalizePackageVersion(parsed.version)
      if (!ecosystem || !name || version === null) {
        resolved.push(unsupportedDep(parsed.name, parsed.version, 'invalid_param'))
        continue
      }
      toResolve.push(makePackageDep(ecosystem, name, version))
      continue
    }

    if (item.kind === 'github') {
      const owner = typeof item.owner === 'string' ? item.owner.toLowerCase() : ''
      const repo = typeof item.repo === 'string' ? item.repo.toLowerCase() : ''
      const version = typeof item.version === 'string' ? normalizePackageVersion(item.version) : ''
      if (!isValidParam(owner) || !isValidParam(repo) || version === null) {
        resolved.push(unsupportedDep(`${owner}/${repo}`, '', 'invalid_github_repo'))
        continue
      }
      const direct = githubDep(`${owner}/${repo}`, version)
      if (direct) resolved.push(direct)
      else resolved.push(unsupportedDep(`${owner}/${repo}`, version, 'invalid_github_repo'))
      continue
    }

    resolved.push(unsupportedDep('unsupported-item', '', 'unsupported_ecosystem'))
  }

  return { toResolve, resolved }
}

function githubDep(slug: string, version: string): ResolvedDep | null {
  const [owner, repo] = slug.split('/')
  if (!owner || !repo || !isValidParam(owner) || !isValidParam(repo)) return null
  return {
    name: `${owner.toLowerCase()}/${repo.toLowerCase()}`,
    version,
    dev: false,
    ecosystem: 'github',
    dependencyType: 'direct',
    sourceFormat: 'batch',
    github: { owner: owner.toLowerCase(), repo: repo.toLowerCase() },
    resolvedFrom: 'direct',
  }
}

function unsupportedDep(name: string, version: string, reason: string): ResolvedDep {
  return {
    name,
    version,
    dev: false,
    ecosystem: 'unsupported' as ParsedEcosystem,
    dependencyType: 'direct',
    sourceFormat: 'batch',
    github: null,
    resolvedFrom: null,
    unresolvedReason: reason,
  }
}

export { batch }
