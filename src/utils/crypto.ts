// ---------------------------------------------------------------------------
// Shared cryptographic utilities
//
// Single source of truth for constant-time comparison, hex encoding, and
// IP hashing — previously duplicated across admin.ts, admin-auth.ts,
// verify.ts, usage.ts, and scorer.ts.
// ---------------------------------------------------------------------------

/**
 * String comparison that mitigates timing side-channel attacks.
 *
 * Returns `false` immediately when lengths differ (this leaks length but not
 * content). When lengths match, compares every UTF-16 code unit (charCodeAt)
 * regardless of where the first mismatch occurs.
 *
 * NOTE: operates on JS string code units, not raw bytes. This is sufficient
 * for comparing hex-encoded hashes and API keys used in this codebase.
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
