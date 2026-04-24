import { describe, expect, it, vi } from 'vitest';
import { app } from '../app';

const executionCtx: ExecutionContext = {
  waitUntil: (_p: Promise<unknown>) => {},
  passThroughOnException: () => {},
  props: {},
};

/** Helper: POST to /_data/waitlist with JSON body */
function postWaitlist(body: Record<string, string>, env: Record<string, unknown> = {}) {
  return app.fetch(
    new Request('https://isitalive.dev/_data/waitlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    env as any,
    executionCtx,
  );
}

describe('/_data/waitlist', () => {
  // ── Security invariant: constant response ─────────────────────────

  it('returns identical 200 for a valid submission', async () => {
    const put = vi.fn().mockResolvedValue(undefined);
    const res = await postWaitlist(
      { email: 'alice@example.com', tier: 'starter', 'cf-turnstile-response': '' },
      { WAITLIST_KV: { put } },
    );

    expect(res.status).toBe(200);
    const json = await res.json() as { ok: boolean; message: string };
    expect(json.ok).toBe(true);
    expect(json.message).toBeTruthy();
  });

  it('returns identical 200 for an invalid email', async () => {
    const put = vi.fn();
    const res = await postWaitlist(
      { email: 'not-an-email', tier: 'starter', 'cf-turnstile-response': '' },
      { WAITLIST_KV: { put } },
    );

    expect(res.status).toBe(200);
    const json = await res.json() as { ok: boolean };
    expect(json.ok).toBe(true);
    // Must NOT write to KV for invalid emails
    expect(put).not.toHaveBeenCalled();
  });

  it('returns identical 200 for an invalid tier', async () => {
    const put = vi.fn();
    const res = await postWaitlist(
      { email: 'alice@example.com', tier: 'enterprise', 'cf-turnstile-response': '' },
      { WAITLIST_KV: { put } },
    );

    expect(res.status).toBe(200);
    const json = await res.json() as { ok: boolean };
    expect(json.ok).toBe(true);
    expect(put).not.toHaveBeenCalled();
  });

  it('returns identical 200 for an empty body', async () => {
    const res = await postWaitlist({}, { WAITLIST_KV: { put: vi.fn() } });

    expect(res.status).toBe(200);
    const json = await res.json() as { ok: boolean };
    expect(json.ok).toBe(true);
  });

  it('returns 413 for oversized payloads', async () => {
    const res = await app.fetch(
      new Request('https://isitalive.dev/_data/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'x'.repeat(20 * 1024), tier: 'starter' }),
      }),
      { WAITLIST_KV: { put: vi.fn() } } as any,
      executionCtx,
    );

    expect(res.status).toBe(413);
    await expect(res.json()).resolves.toEqual({ ok: false, error: 'payload_too_large' });
  });

  // ── KV write correctness ──────────────────────────────────────────

  it('writes to KV with a SHA-256 hashed key prefix', async () => {
    const put = vi.fn().mockResolvedValue(undefined);
    await postWaitlist(
      { email: 'Bob@Example.COM', tier: 'pro', 'cf-turnstile-response': '' },
      { WAITLIST_KV: { put } },
    );

    expect(put).toHaveBeenCalledOnce();
    const [key, value] = put.mock.calls[0] as [string, string];

    // Key must start with waitlist: prefix and be a hex hash (not the raw email)
    expect(key).toMatch(/^waitlist:[a-f0-9]{64}$/);
    expect(key).not.toContain('bob');

    // Value must contain the normalised email and tier
    const parsed = JSON.parse(value) as { email: string; tier: string; timestamp: string };
    expect(parsed.email).toBe('bob@example.com'); // lowercased
    expect(parsed.tier).toBe('pro');
    expect(parsed.timestamp).toBeTruthy();
  });

  it('produces the same KV key for case-variant emails', async () => {
    const put = vi.fn().mockResolvedValue(undefined);

    await postWaitlist(
      { email: 'Alice@Example.com', tier: 'starter', 'cf-turnstile-response': '' },
      { WAITLIST_KV: { put } },
    );
    const key1 = (put.mock.calls[0] as [string])[0];

    put.mockClear();

    await postWaitlist(
      { email: 'alice@example.com', tier: 'business', 'cf-turnstile-response': '' },
      { WAITLIST_KV: { put } },
    );
    const key2 = (put.mock.calls[0] as [string])[0];

    expect(key1).toBe(key2);
  });

  // ── No read endpoint ──────────────────────────────────────────────

  it('does not expose a GET endpoint for waitlist data', async () => {
    const res = await app.fetch(
      new Request('https://isitalive.dev/_data/waitlist'),
      {} as any,
      executionCtx,
    );

    // Should not return 200 with data — 301/404/405 are all acceptable
    expect(res.status).not.toBe(200);
  });
});
