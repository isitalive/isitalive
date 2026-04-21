// Typed provider errors — routes map `code` to HTTP status + JSON error_code.

export type ProviderErrorCode =
  | 'not_found'
  | 'github_rate_limited'
  | 'github_timeout'
  | 'github_circuit_open'
  | 'upstream_error'

export class ProviderError extends Error {
  readonly code: ProviderErrorCode

  constructor(code: ProviderErrorCode, message: string) {
    super(message)
    this.name = 'ProviderError'
    this.code = code
  }
}

export function isProviderError(err: unknown): err is ProviderError {
  return err instanceof ProviderError
}

/** Fallback classifier for non-ProviderError throws. Prefer `err.code` directly. */
export function classifyError(err: unknown): ProviderErrorCode {
  if (isProviderError(err)) return err.code
  const msg = err instanceof Error ? err.message : String(err)
  if (/timed out after|aborted|timeout/i.test(msg)) return 'github_timeout'
  if (/not found|404/i.test(msg)) return 'not_found'
  if (/rate.?limit|x-ratelimit/i.test(msg)) return 'github_rate_limited'
  return 'upstream_error'
}
