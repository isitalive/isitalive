import type { AgentPolicy } from './agent'
import type { ScoreAuditOptions } from './scorer'

export interface ParsedAuditRequestOptions {
  options: Pick<ScoreAuditOptions, 'policy' | 'maxAgeSeconds' | 'preferFresh'>
  error?: {
    message: string
    error_code: string
  }
}

const CONFIDENCE_VALUES = new Set(['low', 'medium', 'high'])

export function parseAuditRequestOptions(input: Record<string, unknown>): ParsedAuditRequestOptions {
  const policyResult = parsePolicy(input.policy)
  if (policyResult.error) return { options: {}, error: policyResult.error }

  const maxAgeResult = parseNonNegativeInteger(input.maxAgeSeconds, 'maxAgeSeconds')
  if (maxAgeResult.error) return { options: {}, error: maxAgeResult.error }

  if (input.preferFresh !== undefined && typeof input.preferFresh !== 'boolean') {
    return {
      options: {},
      error: { message: 'preferFresh must be a boolean', error_code: 'invalid_param' },
    }
  }

  return {
    options: {
      policy: policyResult.policy,
      maxAgeSeconds: maxAgeResult.value,
      preferFresh: input.preferFresh === true ? true : undefined,
    },
  }
}

function parsePolicy(value: unknown): { policy?: AgentPolicy; error?: { message: string; error_code: string } } {
  if (value === undefined || value === null) return {}
  if (typeof value !== 'object' || Array.isArray(value)) {
    return { error: { message: 'policy must be an object', error_code: 'invalid_param' } }
  }

  const raw = value as Record<string, unknown>
  const policy: AgentPolicy = {}

  for (const field of ['failBelowScore', 'warnBelowScore', 'warnIfNoReleaseDays'] as const) {
    const parsed = parseNonNegativeInteger(raw[field], `policy.${field}`)
    if (parsed.error) return { error: parsed.error }
    if (parsed.value !== undefined) policy[field] = parsed.value
  }

  if (raw.ignoreDevDependencies !== undefined) {
    if (typeof raw.ignoreDevDependencies !== 'boolean') {
      return { error: { message: 'policy.ignoreDevDependencies must be a boolean', error_code: 'invalid_param' } }
    }
    policy.ignoreDevDependencies = raw.ignoreDevDependencies
  }

  if (raw.failOnUnresolved !== undefined) {
    if (typeof raw.failOnUnresolved !== 'boolean') {
      return { error: { message: 'policy.failOnUnresolved must be a boolean', error_code: 'invalid_param' } }
    }
    policy.failOnUnresolved = raw.failOnUnresolved
  }

  if (raw.requireResolutionConfidence !== undefined) {
    if (typeof raw.requireResolutionConfidence !== 'string' || !CONFIDENCE_VALUES.has(raw.requireResolutionConfidence)) {
      return {
        error: {
          message: 'policy.requireResolutionConfidence must be low, medium, or high',
          error_code: 'invalid_param',
        },
      }
    }
    policy.requireResolutionConfidence = raw.requireResolutionConfidence as AgentPolicy['requireResolutionConfidence']
  }

  return { policy }
}

function parseNonNegativeInteger(
  value: unknown,
  field: string,
): { value?: number; error?: { message: string; error_code: string } } {
  if (value === undefined || value === null) return {}
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    return { error: { message: `${field} must be a non-negative integer`, error_code: 'invalid_param' } }
  }
  return { value }
}
