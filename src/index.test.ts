import { describe, expect, it } from 'vitest';
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
});
