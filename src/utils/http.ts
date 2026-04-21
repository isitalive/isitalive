// ---------------------------------------------------------------------------
// HTTP utilities — bounded request reads + timed outbound fetches
// ---------------------------------------------------------------------------

export class RequestBodyTooLargeError extends Error {
  constructor() {
    super('PAYLOAD_TOO_LARGE')
  }
}

/**
 * Read a request body with a hard byte limit.
 * Enforces the limit via Content-Length when present and while streaming.
 */
export async function readBodyWithByteLimit(req: Request, maxBytes: number): Promise<string> {
  const clHeader = req.headers.get('content-length')
  if (clHeader != null) {
    const cl = Number(clHeader)
    if (Number.isFinite(cl) && cl > maxBytes) {
      throw new RequestBodyTooLargeError()
    }
  }

  const stream = req.body
  if (!stream) return ''

  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let totalBytes = 0

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value) continue

      totalBytes += value.byteLength
      if (totalBytes > maxBytes) {
        reader.cancel('payload too large').catch(() => {})
        throw new RequestBodyTooLargeError()
      }

      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }

  const merged = new Uint8Array(totalBytes)
  let offset = 0
  for (const chunk of chunks) {
    merged.set(chunk, offset)
    offset += chunk.byteLength
  }

  return new TextDecoder('utf-8').decode(merged)
}

export interface FetchWithTimeoutOptions extends RequestInit {
  timeoutMs: number;
  timeoutMessage: string;
}

/**
 * Wrap fetch() with AbortSignal.timeout and normalized timeout errors.
 */
export async function fetchWithTimeout(
  input: RequestInfo | URL,
  options: FetchWithTimeoutOptions,
): Promise<Response> {
  const { timeoutMs, timeoutMessage, ...init } = options

  try {
    return await fetch(input, {
      ...init,
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (err) {
    if (err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
      throw new Error(timeoutMessage)
    }
    throw err
  }
}

export interface FetchWithRetryOptions extends FetchWithTimeoutOptions {
  /** Max retry attempts (default 3). Total calls = retries + 1. */
  retries?: number
  /** Backoff delay per retry index (default [200, 500, 1200] ms). */
  backoffMs?: readonly number[]
  /** Statuses that trigger a retry (default 429, 502, 503, 504). */
  retryOnStatus?: readonly number[]
  /** Upper bound on Retry-After honoring to fit the Worker budget (default 5000 ms). */
  maxRetryAfterMs?: number
  /** Sleep hook — overridable for tests. */
  sleepFn?: (ms: number) => Promise<void>
}

const DEFAULT_BACKOFF: readonly number[] = [200, 500, 1200]
const DEFAULT_RETRY_ON_STATUS: readonly number[] = [429, 502, 503, 504]
const TIMEOUT_MARKER = 'timed out after'

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function parseRetryAfter(header: string | null, maxMs: number): number | null {
  if (!header) return null
  const seconds = Number(header)
  if (Number.isFinite(seconds)) {
    return Math.min(Math.max(seconds * 1000, 0), maxMs)
  }
  const dateMs = Date.parse(header)
  if (!Number.isNaN(dateMs)) {
    return Math.min(Math.max(dateMs - Date.now(), 0), maxMs)
  }
  return null
}

/**
 * Whether a 403 response looks like a GitHub rate-limit / abuse-detection
 * response (worth retrying) rather than a permanent authorization failure.
 */
function isRetryable403(res: Response): boolean {
  if (res.headers.get('retry-after')) return true
  if (res.headers.get('x-ratelimit-remaining') === '0') return true
  return false
}

/**
 * fetchWithTimeout + bounded retry-with-backoff for transient upstream errors.
 * Honors Retry-After (capped) and retries rate-limited 403s. Does NOT throw on
 * a non-2xx response after retries — it returns the last Response so callers
 * can surface the upstream body.
 */
export async function fetchWithRetry(
  input: RequestInfo | URL,
  options: FetchWithRetryOptions,
): Promise<Response> {
  const {
    retries = 3,
    backoffMs = DEFAULT_BACKOFF,
    retryOnStatus = DEFAULT_RETRY_ON_STATUS,
    maxRetryAfterMs = 5_000,
    sleepFn = defaultSleep,
    ...timeoutOpts
  } = options

  let lastResponse: Response | null = null
  let networkRetried = false

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetchWithTimeout(input, timeoutOpts)
      if (res.ok) return res

      const shouldRetry =
        retryOnStatus.includes(res.status) ||
        (res.status === 403 && isRetryable403(res))

      if (!shouldRetry || attempt === retries) {
        return res
      }

      lastResponse = res

      const retryAfterMs = parseRetryAfter(res.headers.get('retry-after'), maxRetryAfterMs)
      const delay = retryAfterMs ?? backoffMs[Math.min(attempt, backoffMs.length - 1)] ?? 0
      if (delay > 0) await sleepFn(delay)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      const isTimeout = message.includes(TIMEOUT_MARKER)

      // Network / timeout errors get at most one retry so we don't blow the budget.
      if (!isTimeout || networkRetried || attempt === retries) {
        throw err
      }
      networkRetried = true

      const delay = backoffMs[Math.min(attempt, backoffMs.length - 1)] ?? 0
      if (delay > 0) await sleepFn(delay)
    }
  }

  // Should be unreachable, but prefer the last known response over an unhelpful error.
  if (lastResponse) return lastResponse
  throw new Error(`fetchWithRetry: exhausted without response`)
}
