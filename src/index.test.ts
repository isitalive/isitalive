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

  it('keeps the public health endpoint available', async () => {
    const response = await app.fetch(
      new Request('https://isitalive.dev/health'),
      env,
      executionCtx,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      status: 'ok',
      version,
    });
  });

  it('rejects POST to removed /_view endpoint', async () => {
    const response = await app.fetch(
      new Request('https://isitalive.dev/_view', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'https://isitalive.dev',
        },
        body: JSON.stringify({ r: 'owner/repo', s: 75, v: 'stable' }),
      }),
      {} as any,
      executionCtx,
    );

    // /_view no longer exists — analytics tracked via API
    expect(response.status).toBe(404);
  });
});
