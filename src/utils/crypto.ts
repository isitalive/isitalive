// ---------------------------------------------------------------------------
// Shared cryptographic utilities
//
// Single source of truth for constant-time comparison, hex encoding, and
// IP hashing — previously duplicated across admin.ts, admin-auth.ts,
// verify.ts, usage.ts, and scorer.ts.
// ---------------------------------------------------------------------------

/**
 * Constant-time string comparison to prevent timing side-channel attacks.
 * Returns `false` immediately if lengths differ (length is not secret).
 * For equal-length inputs, compares every byte to avoid leaking mismatch position.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let mismatch = 0
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return mismatch === 0
}

/** Convert an ArrayBuffer to a lowercase hex string */
export function bufferToHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let hex = ''
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0')
  }
  return hex
}

/** Hash a string using SHA-256 and return the full hex digest */
export async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(input),
  )
  return bufferToHex(buf)
}
