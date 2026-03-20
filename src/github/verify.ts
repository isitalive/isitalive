// ---------------------------------------------------------------------------
// GitHub App — webhook signature verification
//
// Verifies the X-Hub-Signature-256 header against the webhook secret using
// HMAC-SHA256 via the Web Crypto API. No external dependencies.
//
// Ref: https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries
// ---------------------------------------------------------------------------

/**
 * Verify a GitHub webhook signature.
 *
 * @returns true if the signature is valid, false otherwise
 */
export async function verifyWebhookSignature(
  secret: string,
  body: string,
  signatureHeader: string | null,
): Promise<boolean> {
  if (!signatureHeader || !signatureHeader.startsWith('sha256=')) {
    return false;
  }

  const expectedHex = signatureHeader.slice('sha256='.length);

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const mac = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(body),
  );

  const computedHex = bufferToHex(mac);

  // Constant-time comparison to prevent timing attacks
  return timingSafeEqual(computedHex, expectedHex);
}

/** Convert an ArrayBuffer to a lowercase hex string */
function bufferToHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}

/**
 * Constant-time string comparison.
 * Prevents timing side-channel attacks by always comparing every byte.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;

  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}
