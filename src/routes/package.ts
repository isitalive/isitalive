import { Hono, type Context } from 'hono'
import type { Env } from '../types/env'
import type { Tier } from '../cache/index'
import { handleProjectCheck } from './check'
import {
  normalizePackageName,
  normalizePackageVersion,
  packageResolutionProblem,
  parsePackageEcosystem,
  resolvePackageDependency,
  resolvedGithubSlug,
  SUPPORTED_PACKAGE_ECOSYSTEMS,
  type PackageEcosystem,
} from '../audit/packages'

type AppEnv = { Bindings: Env; Variables: { tier: Tier; keyName: string | null; isAuthenticated: boolean } }
type AppContext = Context<AppEnv>

const packageResolve = new Hono<AppEnv>()
const packageCheck = new Hono<AppEnv>()

function packageNameFromRequest(c: AppContext): string {
  return c.req.param('name') ?? c.req.query('name') ?? ''
}

function versionFromRequest(c: AppContext): string {
  return c.req.query('version') ?? ''
}

async function resolveForRequest(c: AppContext, rawEcosystem: string, rawName: string) {
  const ecosystem = parsePackageEcosystem(rawEcosystem)
  if (!ecosystem) {
    return {
      ok: false as const,
      response: c.json({
        error: `Unsupported ecosystem: ${rawEcosystem}. Supported: ${SUPPORTED_PACKAGE_ECOSYSTEMS.join(', ')}`,
        error_code: 'unsupported_ecosystem',
        supported: SUPPORTED_PACKAGE_ECOSYSTEMS,
      }, 400),
    }
  }

  const name = normalizePackageName(ecosystem, rawName)
  if (!name) {
    return {
      ok: false as const,
      response: c.json({
        error: 'Missing or invalid package name',
        error_code: 'invalid_param',
        hint: ecosystem === 'go'
          ? 'Use a Go module path such as golang.org/x/crypto.'
          : ecosystem === 'pypi'
            ? 'Use a PyPI package name such as requests or django.'
            : 'Use an npm package name such as react or @types/node.',
      }, 400),
    }
  }

  const version = normalizePackageVersion(versionFromRequest(c))
  if (version === null) {
    return {
      ok: false as const,
      response: c.json({
        error: 'Invalid package version',
        error_code: 'invalid_param',
        hint: 'Package version context must be 128 characters or fewer and cannot contain control characters.',
      }, 400),
    }
  }

  const result = await resolvePackageDependency(ecosystem, name, c.env, c.executionCtx, version)
  const github = resolvedGithubSlug(result.resolved)
  if (!github) {
    const problem = packageResolutionProblem(result.resolved.unresolvedReason)
    return {
      ok: false as const,
      response: c.json({
        error: problem.error,
        error_code: problem.error_code,
        package: result.package,
        unresolvedReason: result.resolved.unresolvedReason,
        hint: problem.hint,
      }, problem.status),
    }
  }

  return {
    ok: true as const,
    ecosystem: ecosystem as PackageEcosystem,
    result,
    github,
  }
}

function resolutionBody(resolved: Awaited<ReturnType<typeof resolveForRequest>> & { ok: true }) {
  return {
    package: resolved.result.package,
    github: resolved.github,
    resolvedFrom: resolved.result.resolved.resolvedFrom,
  }
}

async function resolveHandler(c: AppContext) {
  const { ecosystem } = c.req.param()
  const resolved = await resolveForRequest(c, ecosystem, packageNameFromRequest(c))
  if (!resolved.ok) return resolved.response
  return c.json(resolutionBody(resolved))
}

async function checkHandler(c: AppContext) {
  const { ecosystem } = c.req.param()
  const resolved = await resolveForRequest(c, ecosystem, packageNameFromRequest(c))
  if (!resolved.ok) return resolved.response
  const [owner, repo] = resolved.github.split('/')
  return handleProjectCheck(c, 'github', owner, repo, {
    extraResponseFields: resolutionBody(resolved),
  })
}

packageResolve.get('/:ecosystem/:name{.+}', resolveHandler)
packageResolve.get('/:ecosystem', resolveHandler)

packageCheck.get('/:ecosystem/:name{.+}', checkHandler)
packageCheck.get('/:ecosystem', checkHandler)

export { packageResolve, packageCheck }
