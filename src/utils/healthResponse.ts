// ---------------------------------------------------------------------------
// Response shaping for agent-facing health results
// ---------------------------------------------------------------------------

import type { AuditDep, AuditResult } from '../audit/scorer'
import type { ScoringResult } from '../scoring/types'

export interface IncludeFlags {
  drivers: boolean
  metrics: boolean
  signals: boolean
}

const VALID_INCLUDES = new Set<keyof IncludeFlags>(['drivers', 'metrics', 'signals'])

export function parseIncludeFlags(requestUrl: string): IncludeFlags {
  const searchParams = new URL(requestUrl).searchParams
  const values = searchParams
    .getAll('include')
    .flatMap((value) => value.split(','))
    .map((value) => value.trim())
    .filter((value): value is keyof IncludeFlags => VALID_INCLUDES.has(value as keyof IncludeFlags))

  return {
    drivers: values.includes('drivers'),
    metrics: values.includes('metrics'),
    signals: values.includes('signals'),
  }
}

export function includeKey(flags: IncludeFlags): string {
  const values = (Object.entries(flags) as Array<[keyof IncludeFlags, boolean]>)
    .filter(([, enabled]) => enabled)
    .map(([name]) => name)
    .sort()
  return values.length > 0 ? values.join(',') : 'base'
}

export function shapeScoringResult(
  result: ScoringResult,
  flags: IncludeFlags,
): Omit<ScoringResult, 'metrics'> & { metrics?: ScoringResult['metrics'] } {
  if (flags.metrics) return result
  const { metrics, ...rest } = result
  void metrics
  return rest
}

function shapeAuditDep(
  dep: AuditDep,
  flags: IncludeFlags,
): Omit<AuditDep, 'signals' | 'drivers' | 'metrics'> & Pick<AuditDep, 'signals' | 'drivers' | 'metrics'> {
  return {
    ...dep,
    signals: flags.signals ? dep.signals : undefined,
    drivers: flags.drivers ? dep.drivers : undefined,
    metrics: flags.metrics ? dep.metrics : undefined,
  }
}

export function shapeAuditResult(
  result: AuditResult,
  flags: IncludeFlags,
): AuditResult {
  return {
    ...result,
    dependencies: result.dependencies.map((dep) => shapeAuditDep(dep, flags)),
  }
}
