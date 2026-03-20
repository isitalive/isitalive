// ---------------------------------------------------------------------------
// GitHub App — authentication
//
// 1. Generate a JWT (RS256) signed with the app's private key
// 2. Exchange the JWT for an installation access token
// 3. Cache installation tokens in KV (valid for 1 hour, refreshed at 50 min)
//
// Ref: https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app
// ---------------------------------------------------------------------------

import type { Env } from '../scoring/types';

const GITHUB_API = 'https://api.github.com';
const TOKEN_CACHE_PREFIX = 'gh-app:token:';
const TOKEN_REFRESH_MARGIN_MS = 10 * 60 * 1000; // Refresh 10 min before expiry

interface CachedToken {
  token: string;
  expiresAt: number; // epoch ms
}

/**
 * Get an installation access token, using KV cache when possible.
 */
export async function getInstallationToken(
  env: Env,
  installationId: number,
): Promise<string> {
  const cacheKey = `${TOKEN_CACHE_PREFIX}${installationId}`;

  // Check KV cache
  const cached = await env.CACHE_KV.get(cacheKey, 'json') as CachedToken | null;
  if (cached && cached.expiresAt > Date.now() + TOKEN_REFRESH_MARGIN_MS) {
    return cached.token;
  }

  // Generate a fresh token
  const jwt = await generateAppJwt(env.GITHUB_APP_ID!, env.GITHUB_PRIVATE_KEY!);

  const response = await fetch(
    `${GITHUB_API}/app/installations/${installationId}/access_tokens`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${jwt}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'isitalive-github-app/1.0',
      },
    },
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to get installation token (${response.status}): ${text}`);
  }

  const data = await response.json() as { token: string; expires_at: string };

  // Cache in KV — expires when the token does (minus margin)
  const expiresAt = new Date(data.expires_at).getTime();
  const ttlSeconds = Math.max(1, Math.floor((expiresAt - Date.now()) / 1000) - 60);

  await env.CACHE_KV.put(cacheKey, JSON.stringify({
    token: data.token,
    expiresAt,
  } satisfies CachedToken), { expirationTtl: ttlSeconds });

  return data.token;
}

// ---------------------------------------------------------------------------
// JWT generation (RS256)
// ---------------------------------------------------------------------------

/**
 * Generate a short-lived JWT for GitHub App authentication.
 * Valid for 10 minutes (GitHub's maximum).
 */
async function generateAppJwt(appId: string, privateKeyPem: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);

  const header = {
    alg: 'RS256',
    typ: 'JWT',
  };

  const payload = {
    iat: now - 60,     // Issued 60s ago (clock skew tolerance)
    exp: now + 600,    // Expires in 10 minutes
    iss: appId,
  };

  const headerB64 = base64url(JSON.stringify(header));
  const payloadB64 = base64url(JSON.stringify(payload));
  const signingInput = `${headerB64}.${payloadB64}`;

  const key = await importPrivateKey(privateKeyPem);
  const signature = await crypto.subtle.sign(
    { name: 'RSASSA-PKCS1-v1_5' },
    key,
    new TextEncoder().encode(signingInput),
  );

  const signatureB64 = base64urlFromBuffer(signature);
  return `${signingInput}.${signatureB64}`;
}

/**
 * Import a PEM-encoded RSA private key for use with Web Crypto.
 */
async function importPrivateKey(pem: string): Promise<CryptoKey> {
  // Strip PEM headers and decode
  const pemBody = pem
    .replace(/-----BEGIN RSA PRIVATE KEY-----/g, '')
    .replace(/-----END RSA PRIVATE KEY-----/g, '')
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\s/g, '');

  const binary = Uint8Array.from(atob(pemBody), c => c.charCodeAt(0));

  // Try PKCS8 first (-----BEGIN PRIVATE KEY-----), fall back to pkcs1-wrapped
  try {
    return await crypto.subtle.importKey(
      'pkcs8',
      binary.buffer as ArrayBuffer,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['sign'],
    );
  } catch {
    // If the key is PKCS#1 (-----BEGIN RSA PRIVATE KEY-----), wrap it in PKCS#8
    const pkcs8 = wrapPkcs1InPkcs8(binary);
    return await crypto.subtle.importKey(
      'pkcs8',
      pkcs8.buffer as ArrayBuffer,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['sign'],
    );
  }
}

/**
 * Wrap a PKCS#1 RSA private key in a PKCS#8 envelope.
 * GitHub App private keys are typically PKCS#1 format.
 */
function wrapPkcs1InPkcs8(pkcs1: Uint8Array): Uint8Array {
  // PKCS#8 header for RSA keys (OID 1.2.840.113549.1.1.1)
  const pkcs8Header = new Uint8Array([
    0x30, 0x82, 0x00, 0x00, // SEQUENCE (length placeholder)
    0x02, 0x01, 0x00,       // INTEGER 0 (version)
    0x30, 0x0d,             // SEQUENCE (AlgorithmIdentifier)
    0x06, 0x09,             //   OID 1.2.840.113549.1.1.1 (rsaEncryption)
    0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01,
    0x05, 0x00,             //   NULL
    0x04, 0x82, 0x00, 0x00, // OCTET STRING (length placeholder)
  ]);

  const totalLen = pkcs8Header.length + pkcs1.length - 4; // minus 4 for outer SEQUENCE header
  const octetLen = pkcs1.length;

  const result = new Uint8Array(pkcs8Header.length + pkcs1.length);
  result.set(pkcs8Header);
  result.set(pkcs1, pkcs8Header.length);

  // Patch outer SEQUENCE length (bytes 2-3)
  result[2] = (totalLen >> 8) & 0xff;
  result[3] = totalLen & 0xff;

  // Patch OCTET STRING length (bytes 24-25)
  result[pkcs8Header.length - 2] = (octetLen >> 8) & 0xff;
  result[pkcs8Header.length - 1] = octetLen & 0xff;

  return result;
}

// ---------------------------------------------------------------------------
// Base64url helpers
// ---------------------------------------------------------------------------

function base64url(str: string): string {
  return btoa(str)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function base64urlFromBuffer(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}
