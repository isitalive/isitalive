import type { Env } from '../types/env'
import type { ParsedDep } from './parsers'
import { resolveAll, type ResolvedDep } from './resolver'

export const SUPPORTED_PACKAGE_ECOSYSTEMS = ['npm', 'go'] as const
export type PackageEcosystem = typeof SUPPORTED_PACKAGE_ECOSYSTEMS[number]

export type ResolvedPackage = {
  package: {
    ecosystem: PackageEcosystem
    name: string
    version: string
  }
  resolved: ResolvedDep
}

export type PackageResolutionProblem = {
  status: 404 | 502
  error: string
  error_code: string
  hint: string
}

const MAX_PACKAGE_NAME_LENGTH = 255

export function parsePackageEcosystem(value: string): PackageEcosystem | null {
  return SUPPORTED_PACKAGE_ECOSYSTEMS.includes(value as PackageEcosystem)
    ? value as PackageEcosystem
    : null
}

export function normalizePackageName(ecosystem: PackageEcosystem, value: string): string | null {
  const name = value.trim().replace(/\/+$/, '')
  if (!name || name.length > MAX_PACKAGE_NAME_LENGTH) return null
  if (/[\0\r\n\t]/.test(name)) return null
  if (ecosystem === 'npm' && /\s/.test(name)) return null
  if (ecosystem === 'go' && (/\s/.test(name) || !name.includes('.'))) return null
  return name
}

export function makePackageDep(
  ecosystem: PackageEcosystem,
  name: string,
  version = '',
): ParsedDep {
  return {
    ecosystem,
    name,
    version,
    dev: false,
  }
}

export async function resolvePackageDependency(
  ecosystem: PackageEcosystem,
  name: string,
  env: Env,
  ctx?: ExecutionContext,
  version = '',
): Promise<ResolvedPackage> {
  const dep = makePackageDep(ecosystem, name, version)
  const [resolved] = await resolveAll([dep], env, ctx)
  return {
    package: { ecosystem, name, version },
    resolved,
  }
}

export function resolvedGithubSlug(resolved: ResolvedDep): string | null {
  if (!resolved.github) return null
  return `${resolved.github.owner.toLowerCase()}/${resolved.github.repo.toLowerCase()}`
}

export function packageResolutionProblem(reason: string | undefined): PackageResolutionProblem {
  switch (reason) {
    case 'package_not_found':
      return {
        status: 404,
        error: 'Package not found',
        error_code: 'package_not_found',
        hint: 'Check the package name and ecosystem, then try again.',
      }
    case 'registry_timeout':
      return {
        status: 502,
        error: 'Package registry lookup timed out',
        error_code: 'registry_timeout',
        hint: 'Retry the request; the package registry did not respond in time.',
      }
    case 'registry_error':
      return {
        status: 502,
        error: 'Package registry lookup failed',
        error_code: 'registry_error',
        hint: 'Retry later or check the underlying GitHub repository directly.',
      }
    case 'resolver_error':
      return {
        status: 502,
        error: 'Package resolver failed',
        error_code: 'resolver_error',
        hint: 'Retry later or check the underlying GitHub repository directly.',
      }
    case 'no_github_repo':
      return {
        status: 404,
        error: 'Package has no GitHub repository metadata',
        error_code: 'no_github_repo',
        hint: 'IsItAlive scores GitHub maintenance-health; provide the GitHub repo if you know it.',
      }
    default:
      return {
        status: 404,
        error: 'Package could not be resolved to a GitHub repository',
        error_code: reason ?? 'unresolved_package',
        hint: 'IsItAlive scores GitHub maintenance-health; provide the GitHub repo if you know it.',
      }
  }
}
