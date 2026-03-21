import { describe, expect, it, vi } from 'vitest';
import { app } from './app';

const env = {} as any;
const executionCtx = {
  waitUntil: () => {},
  passThroughOnException: () => {},
} as ExecutionContext;

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

  it('keeps the public health endpoint available', async () => {
    const response = await app.fetch(
      new Request('https://isitalive.dev/health'),
      env,
      executionCtx,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      status: 'ok',
      version: '0.4.0',
    });
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
});
