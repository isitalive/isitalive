import { describe, expect, it, vi } from 'vitest';
import { app } from './app';
import { version } from '../package.json';

const env = {} as any;
const executionCtx: ExecutionContext = {
  waitUntil: (_p: Promise<unknown>) => {},
  passThroughOnException: () => {},
  props: {},
};

describe('HTTP surface area hardening', () => {
  it('does not expose the manual cron trigger endpoint', async () => {
    const response = await app.fetch(
      new Request('https://isitalive.dev/_cron?trigger=hourly'),
      env,
      executionCtx,
    );

    expect(response.status).toBe(404);
  });

  it('does not expose the cache test endpoint', async () => {
    const response = await app.fetch(
      new Request('https://isitalive.dev/_cache_test'),
      env,
      executionCtx,
    );

    expect(response.status).toBe(404);
  });

  it('keeps the public health endpoint available and probes KV', async () => {
    const healthyEnv = {
      CACHE_KV: { get: vi.fn(async () => null) },
    } as any;
    const response = await app.fetch(
      new Request('https://isitalive.dev/health'),
      healthyEnv,
      executionCtx,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    const body = await response.json() as { status: string; kv: string; version: string; probeMs: number };
    expect(body.status).toBe('ok');
    expect(body.kv).toBe('ok');
    expect(body.version).toBe(version);
    expect(typeof body.probeMs).toBe('number');
  });

  it('returns 503 from /health when the KV probe fails', async () => {
    const brokenEnv = {
      CACHE_KV: { get: vi.fn(async () => { throw new Error('KV down') }) },
    } as any;
    const response = await app.fetch(
      new Request('https://isitalive.dev/health'),
      brokenEnv,
      executionCtx,
    );

    expect(response.status).toBe(503);
    const body = await response.json() as { status: string; kv: string };
    expect(body.status).toBe('degraded');
    expect(body.kv).toBe('degraded');
  });

  it('rejects analytics beacons from lookalike origins', async () => {
    const response = await app.fetch(
      new Request('https://isitalive.dev/_view', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'https://isitalive.dev.evil.example',
        },
        body: JSON.stringify({ r: 'owner/repo', s: 75, v: 'stable' }),
      }),
      {} as any,
      executionCtx,
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ ok: false });
  });

  it('accepts analytics beacons from the real site origin', async () => {
    const send = vi.fn().mockResolvedValue(undefined);

    const response = await app.fetch(
      new Request('https://isitalive.dev/_view', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'https://isitalive.dev',
        },
        body: JSON.stringify({ r: 'owner/repo', s: 75, v: 'stable' }),
      }),
      {
        USAGE_PIPELINE: { send },
      } as any,
      executionCtx,
    );

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(send).toHaveBeenCalledOnce();
  });

  it('rate limits analytics beacons when limiter blocks the request', async () => {
    const response = await app.fetch(
      new Request('https://isitalive.dev/_view', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'https://isitalive.dev',
        },
        body: JSON.stringify({ r: 'owner/repo', s: 75, v: 'stable' }),
      }),
      {
        RATE_LIMITER_ANON: { limit: vi.fn(async () => ({ success: false })) },
        RATE_LIMITER_AUTH: { limit: vi.fn(async () => ({ success: false })) },
      } as any,
      executionCtx,
    );

    expect(response.status).toBe(429);
  });
});

describe('/api/manifest request hardening', () => {
  it('rejects oversized request bodies before JSON parsing', async () => {
    const keyStore = new Map<string, string>([
      ['sk_test', JSON.stringify({ tier: 'pro', name: 'test', active: true })],
    ])

    const response = await app.fetch(
      new Request('https://isitalive.dev/api/manifest', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer sk_test',
          'Content-Type': 'application/json',
        },
        body: 'x'.repeat(600 * 1024),
      }),
      {
        CACHE_KV: {
          get: vi.fn(async () => null),
          put: vi.fn(async () => {}),
          delete: vi.fn(async () => {}),
        },
        KEYS_KV: {
          get: vi.fn(async (key: string, format?: string) => {
            const value = keyStore.get(key)
            if (!value) return null
            return format === 'json' ? JSON.parse(value) : value
          }),
        },
        RATE_LIMITER_ANON: { limit: vi.fn(async () => ({ success: true })) },
        RATE_LIMITER_AUTH: { limit: vi.fn(async () => ({ success: true })) },
      } as any,
      executionCtx,
    );

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({
      error: 'Payload too large',
      error_code: 'payload_too_large',
    });
  });
});

describe('turnstile body limits', () => {
  it('rejects oversized /_check bodies before processing', async () => {
    const response = await app.fetch(
      new Request('https://isitalive.dev/_check', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: `repo=${'a'.repeat(20 * 1024)}`,
      }),
      {} as any,
      executionCtx,
    )

    expect(response.status).toBe(413)
  })
})

describe('secureHeaders middleware', () => {
  it('sets X-Frame-Options to DENY', async () => {
    const res = await app.fetch(
      new Request('https://isitalive.dev/health'),
      env,
      executionCtx,
    );

    expect(res.headers.get('X-Frame-Options')).toBe('DENY');
  });

  it('sets Referrer-Policy', async () => {
    const res = await app.fetch(
      new Request('https://isitalive.dev/health'),
      env,
      executionCtx,
    );

    expect(res.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
  });

  it('sets X-Content-Type-Options to nosniff', async () => {
    const res = await app.fetch(
      new Request('https://isitalive.dev/health'),
      env,
      executionCtx,
    );

    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
  });

  it('sets Content-Security-Policy with expected directives', async () => {
    const res = await app.fetch(
      new Request('https://isitalive.dev/health'),
      env,
      executionCtx,
    );

    const csp = res.headers.get('Content-Security-Policy');
    expect(csp).toBeTruthy();
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain('https://challenges.cloudflare.com');
  });

  it('sets Permissions-Policy restricting camera/microphone/geolocation', async () => {
    const res = await app.fetch(
      new Request('https://isitalive.dev/health'),
      env,
      executionCtx,
    );

    const pp = res.headers.get('Permissions-Policy');
    expect(pp).toBeTruthy();
    expect(pp).toContain('camera=none');
    expect(pp).toContain('microphone=none');
    expect(pp).toContain('geolocation=none');
  });
});

describe('ETag conditional caching', () => {
  it('returns an ETag header on /openapi.json', async () => {
    const res = await app.fetch(
      new Request('https://isitalive.dev/openapi.json'),
      env,
      executionCtx,
    );

    expect(res.status).toBe(200);
    expect(res.headers.get('ETag')).toBeTruthy();
  });

  it('returns 304 when If-None-Match matches the ETag', async () => {
    // First request — get the ETag
    const first = await app.fetch(
      new Request('https://isitalive.dev/openapi.json'),
      env,
      executionCtx,
    );
    const etag = first.headers.get('ETag');
    expect(etag).toBeTruthy();

    // Second request with If-None-Match
    const second = await app.fetch(
      new Request('https://isitalive.dev/openapi.json', {
        headers: { 'If-None-Match': etag! },
      }),
      env,
      executionCtx,
    );

    expect(second.status).toBe(304);
  });

  it('returns an ETag header on /llms.txt', async () => {
    const res = await app.fetch(
      new Request('https://isitalive.dev/llms.txt'),
      env,
      executionCtx,
    );

    expect(res.status).toBe(200);
    expect(res.headers.get('ETag')).toBeTruthy();
  });
});
