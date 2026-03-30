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

interface FetchWithTimeoutOptions extends RequestInit {
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
