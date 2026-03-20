import { describe, expect, it } from 'vitest';
import { verifyWebhookSignature } from '../github/verify';

// Pre-computed test vector:
// Secret: "test-secret-123"
// Body:   '{"action":"opened"}'

async function computeHmac(secret: string, body: string): Promise<string> {
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
  const bytes = new Uint8Array(mac);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return `sha256=${hex}`;
}

const SECRET = 'test-secret-123';
const BODY = '{"action":"opened"}';

describe('verifyWebhookSignature', () => {
  it('accepts a valid signature', async () => {
    const signature = await computeHmac(SECRET, BODY);
    const result = await verifyWebhookSignature(SECRET, BODY, signature);
    expect(result).toBe(true);
  });

  it('rejects a tampered body', async () => {
    const signature = await computeHmac(SECRET, BODY);
    const result = await verifyWebhookSignature(SECRET, '{"action":"closed"}', signature);
    expect(result).toBe(false);
  });

  it('rejects a wrong secret', async () => {
    const signature = await computeHmac('wrong-secret', BODY);
    const result = await verifyWebhookSignature(SECRET, BODY, signature);
    expect(result).toBe(false);
  });

  it('rejects a null signature', async () => {
    const result = await verifyWebhookSignature(SECRET, BODY, null);
    expect(result).toBe(false);
  });

  it('rejects an empty signature', async () => {
    const result = await verifyWebhookSignature(SECRET, BODY, '');
    expect(result).toBe(false);
  });

  it('rejects a signature without sha256= prefix', async () => {
    const signature = await computeHmac(SECRET, BODY);
    const hexOnly = signature.replace('sha256=', '');
    const result = await verifyWebhookSignature(SECRET, BODY, hexOnly);
    expect(result).toBe(false);
  });
});
