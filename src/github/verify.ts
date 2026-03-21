// ---------------------------------------------------------------------------
// GitHub App — webhook signature verification
//
// Verifies the X-Hub-Signature-256 header against the webhook secret using
// HMAC-SHA256 via the Web Crypto API. No external dependencies.
//
// Ref: https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries
// ---------------------------------------------------------------------------

import { timingSafeEqual, bufferToHex } from '../utils/crypto'

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

// timingSafeEqual and bufferToHex are imported from ../utils/crypto
