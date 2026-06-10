import { PackageURL } from '@interlynk-io/purl-js'
import type { CacheResult, CacheStatus } from '../cache/index'
import { TIERS, type Tier } from '../cache/index'
import type { ResolvedDep } from './resolver'
import type { DependencyType, ParsedEcosystem, ManifestFormat } from './parsers'
import type { ProjectMetrics, ScoreDriver, Verdict } from '../scoring/types'

export type AgentState =
  | 'resolved'
  | 'pending'
  | 'unresolved'
  | 'unsupported_ecosystem'
  | 'private_repo'
  | 'rate_limited'
  | 'provider_error'

export type ResolutionConfidence = 'none' | 'low' | 'medium' | 'high'
export type PolicyOutcome = 'pass' | 'warn' | 'fail' | 'skipped'
export type PolicyVerdict = 'pass' | 'warn' | 'fail'

export interface AgentDependencyIdentity {
  purl: string | null
  ecosystem: ParsedEcosystem
  name: string
  version: string
  dependencyType: DependencyType
  sourceFormat?: ManifestFormat | 'batch'
}

export interface AgentDependencyResolution {
  provider: 'github' | null
  repo: string | null
  source: ResolvedDep['resolvedFrom'] | 'input' | null
  confidence: ResolutionConfidence
}

export interface AgentDataFreshness {
  checkedAt: string | null
  cacheStatus: CacheStatus | 'fresh' | 'pending' | 'unresolved'
  ageSeconds: number | null
  freshUntil: string | null
  staleUntil: string | null
  satisfiesRequestedMaxAge: boolean | null
}

export interface AgentPolicy {
  failBelowScore?: number
  warnBelowScore?: number
  ignoreDevDependencies?: boolean
  failOnUnresolved?: boolean
  requireResolutionConfidence?: Exclude<ResolutionConfidence, 'none'>
  warnIfNoReleaseDays?: number
}

export interface AgentPolicyResult {
  outcome: PolicyOutcome
  reasons: string[]
}

export interface AgentPolicySubject {
  score: number | null
  state: AgentState
  dev: boolean
  dependencyType: DependencyType
  healthVerdict: Verdict | null
  resolution: AgentDependencyResolution
  metrics?: ProjectMetrics
}

const CONFIDENCE_RANK: Record<ResolutionConfidence, number> = {
  none: 0,
  low: 1,
  medium: 2,
  high: 3,
}

export function buildPackagePurl(
  ecosystem: ParsedEcosystem,
  name: string,
  version: string,
): string | null {
  try {
    if (ecosystem === 'npm') {
      const scoped = name.startsWith('@') ? name.split('/') : null
      const namespace = scoped ? scoped[0] : null
      const packageName = scoped ? scoped.slice(1).join('/') : name
      return new PackageURL('npm', namespace, packageName, version || null, null, null).toString()
    }
    if (ecosystem === 'go') {
      const goNamespace = namespaceFromPackageName(name)
      const goName = name.split('/').pop()
      if (!goNamespace || !goName) return null
      return new PackageURL('golang', goNamespace, goName, version || null, null, null).toString()
    }
    if (ecosystem === 'github') {
      const [owner, repo] = name.split('/')
      if (!owner || !repo) return null
      return new PackageURL('github', owner, repo, version || null, null, null).toString()
    }
  } catch {
    return null
  }
  return null
}

export function parseSupportedPurl(value: string): {
  ecosystem: ParsedEcosystem
  name: string
  version: string
} | null {
  let parsed: PackageURL
  try {
    parsed = PackageURL.parse(value)
  } catch {
    return null
  }

  if (parsed.type === 'npm') {
    const name = parsed.namespace ? `${parsed.namespace}/${parsed.name}` : parsed.name
    return { ecosystem: 'npm', name, version: parsed.version ?? '' }
  }

  if (parsed.type === 'golang') {
    const name = parsed.namespace ? `${parsed.namespace}/${parsed.name}` : parsed.name
    return { ecosystem: 'go', name, version: parsed.version ?? '' }
  }

  if (parsed.type === 'github' && parsed.namespace) {
    return { ecosystem: 'github', name: `${parsed.namespace}/${parsed.name}`, version: parsed.version ?? '' }
  }

  return null
}

function namespaceFromPackageName(name: string): string | null {
  const lastSlash = name.lastIndexOf('/')
  if (lastSlash <= 0 || lastSlash === name.length - 1) return null
  return name.slice(0, lastSlash)
}

export function buildIdentity(dep: Pick<ResolvedDep, 'ecosystem' | 'name' | 'version' | 'dependencyType' | 'sourceFormat'>): AgentDependencyIdentity {
  return {
    purl: buildPackagePurl(dep.ecosystem, dep.name, dep.version),
    ecosystem: dep.ecosystem,
    name: dep.name,
    version: dep.version,
    dependencyType: dep.dependencyType,
    sourceFormat: dep.sourceFormat,
  }
}

export function buildResolution(dep: Pick<ResolvedDep, 'github' | 'resolvedFrom'>): AgentDependencyResolution {
  const repo = dep.github ? `${dep.github.owner.toLowerCase()}/${dep.github.repo.toLowerCase()}` : null
  return {
    provider: repo ? 'github' : null,
    repo,
    source: dep.resolvedFrom,
    confidence: resolutionConfidence(dep.resolvedFrom),
  }
}

export function resolutionConfidence(source: ResolvedDep['resolvedFrom'] | 'input' | null): ResolutionConfidence {
  switch (source) {
    case 'direct':
    case 'input':
      return 'high'
    case 'registry':
    case 'vanity':
    case 'cache':
      return 'medium'
    default:
      return 'none'
  }
}

export function stateFromFailure(reason: string | undefined, pending = false): AgentState {
  if (pending) return 'pending'
  switch (reason) {
    case 'private_registry':
      return 'private_repo'
    case 'github_rate_limited':
      return 'rate_limited'
    case 'github_timeout':
    case 'github_circuit_open':
    case 'registry_timeout':
    case 'registry_error':
    case 'resolver_error':
    case 'upstream_error':
    case 'scoring_error':
      return 'provider_error'
    case 'unsupported_ecosystem':
      return 'unsupported_ecosystem'
    default:
      return 'unresolved'
  }
}

export function buildDataFreshness(
  resultCheckedAt: string | undefined,
  cacheStatus: CacheStatus | 'fresh' | 'pending' | 'unresolved',
  tier: Tier,
  cacheMeta?: Pick<CacheResult, 'ageSeconds' | 'storedAt' | 'freshUntil' | 'staleUntil'>,
  maxAgeSeconds?: number,
): AgentDataFreshness {
  const checkedAt = resultCheckedAt ?? cacheMeta?.storedAt ?? null
  const ageSeconds = cacheMeta?.ageSeconds ?? ageSecondsFromIso(checkedAt)
  const config = TIERS[tier]
  const freshUntil = cacheMeta?.freshUntil ?? addSeconds(checkedAt, config.freshTtl)
  const staleUntil = cacheMeta?.staleUntil ?? addSeconds(checkedAt, config.staleTtl)
  const satisfiesRequestedMaxAge = maxAgeSeconds === undefined || ageSeconds === null
    ? null
    : ageSeconds <= maxAgeSeconds

  return {
    checkedAt,
    cacheStatus,
    ageSeconds,
    freshUntil,
    staleUntil,
    satisfiesRequestedMaxAge,
  }
}

export function riskFlagsFor(state: AgentState, freshness: AgentDataFreshness): string[] {
  const flags: string[] = []
  if (freshness.satisfiesRequestedMaxAge === false) flags.push('stale_data')
  if (state === 'private_repo') flags.push('private_repo')
  if (state === 'rate_limited') flags.push('rate_limited')
  if (state === 'provider_error') flags.push('provider_error')
  if (state === 'unresolved') flags.push('unresolved')
  return flags
}

export function topDrivers(drivers: ScoreDriver[] | undefined, limit = 3): ScoreDriver[] | undefined {
  return drivers?.slice(0, limit)
}

export function evaluatePolicy(subject: AgentPolicySubject, policy: AgentPolicy | undefined): AgentPolicyResult | undefined {
  if (!policy) return undefined
  const reasons: string[] = []

  if (policy.ignoreDevDependencies && (subject.dev || subject.dependencyType === 'dev')) {
    return { outcome: 'skipped', reasons: ['ignored_dev_dependency'] }
  }

  if (subject.state !== 'resolved') {
    if (policy.failOnUnresolved) {
      return { outcome: 'fail', reasons: [`state_${subject.state}`] }
    }
    return { outcome: 'warn', reasons: [`state_${subject.state}`] }
  }

  if (
    policy.requireResolutionConfidence &&
    CONFIDENCE_RANK[subject.resolution.confidence] < CONFIDENCE_RANK[policy.requireResolutionConfidence]
  ) {
    reasons.push(`resolution_confidence_below_${policy.requireResolutionConfidence}`)
  }

  if (typeof policy.failBelowScore === 'number' && subject.score !== null && subject.score < policy.failBelowScore) {
    reasons.push(`score_below_${policy.failBelowScore}`)
    return { outcome: 'fail', reasons }
  }

  if (typeof policy.warnBelowScore === 'number' && subject.score !== null && subject.score < policy.warnBelowScore) {
    reasons.push(`score_below_${policy.warnBelowScore}`)
  }

  const releaseAgeDays = subject.metrics?.lastReleaseAgeDays
  if (
    typeof policy.warnIfNoReleaseDays === 'number' &&
    typeof releaseAgeDays === 'number' &&
    releaseAgeDays > policy.warnIfNoReleaseDays
  ) {
    reasons.push(`last_release_older_than_${policy.warnIfNoReleaseDays}_days`)
  }

  if (reasons.some((reason) => reason.startsWith('resolution_confidence_below_'))) {
    return { outcome: 'fail', reasons }
  }

  return reasons.length > 0
    ? { outcome: 'warn', reasons }
    : { outcome: 'pass', reasons }
}

export function aggregatePolicyVerdict(results: Array<AgentPolicyResult | undefined>): PolicyVerdict | undefined {
  const present = results.filter((result): result is AgentPolicyResult => Boolean(result))
  if (present.length === 0) return undefined
  if (present.some((result) => result.outcome === 'fail')) return 'fail'
  if (present.some((result) => result.outcome === 'warn')) return 'warn'
  return 'pass'
}

function ageSecondsFromIso(iso: string | null): number | null {
  if (!iso) return null
  const time = Date.parse(iso)
  if (!Number.isFinite(time)) return null
  return Math.max(0, Math.round((Date.now() - time) / 1000))
}

function addSeconds(iso: string | null, seconds: number): string | null {
  if (!iso) return null
  const time = Date.parse(iso)
  if (!Number.isFinite(time)) return null
  return new Date(time + seconds * 1000).toISOString()
}
