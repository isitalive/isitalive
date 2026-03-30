// ---------------------------------------------------------------------------
// GitHub App — Hono webhook sub-app
//
// Mounted at /github in the main app. Receives GitHub webhook payloads,
// verifies the signature, and dispatches to event handlers.
// ---------------------------------------------------------------------------

import { Hono } from 'hono';
import type { Env } from '../types/env';
import { verifyWebhookSignature } from './verify';
import { handlePullRequest, handlePush, handleInstallation } from './handlers';
import { DEFAULT_CONFIG } from './types';
import type { PullRequestEvent, PushEvent, InstallationEvent } from './types';
import { readBodyWithByteLimit, RequestBodyTooLargeError } from '../utils/http';

export const githubWebhook = new Hono<{ Bindings: Env }>();

githubWebhook.post('/webhook', async (c) => {
  const webhookSecret = c.env.GITHUB_WEBHOOK_SECRET;

  // Webhook secret must be configured
  if (!webhookSecret) {
    console.error('GitHub App: GITHUB_WEBHOOK_SECRET not configured');
    return c.json({ error: 'GitHub App not configured' }, 500);
  }

  // ── Guard against oversized payloads ────────────────────────────────
  // GitHub webhook payloads are typically < 25 KB. Cap at 1 MB to prevent
  // OOM / CPU-exhaustion. Enforce via Content-Length (when valid) AND
  // while streaming the request body so spoofed/absent headers can't bypass.
  const MAX_WEBHOOK_BODY = 1_048_576; // 1 MB

  // ── Read body with hard byte limit ──────────────────────────────────
  const signature = c.req.header('x-hub-signature-256') ?? null;
  let body: string;
  try {
    body = await readBodyWithByteLimit(c.req.raw, MAX_WEBHOOK_BODY);
  } catch (err) {
    if (err instanceof RequestBodyTooLargeError) {
      return c.json({ error: 'Payload too large' }, 413);
    }
    throw err;
  }

  const valid = await verifyWebhookSignature(webhookSecret, body, signature);
  if (!valid) {
    console.warn('GitHub App: invalid webhook signature');
    return c.json({ error: 'Invalid signature' }, 401);
  }

  // ── Parse event ─────────────────────────────────────────────────────
  const event = c.req.header('x-github-event');
  const deliveryId = c.req.header('x-github-delivery');

  if (!event) {
    return c.json({ error: 'Missing X-GitHub-Event header' }, 400);
  }

  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return c.json({ error: 'Invalid JSON' }, 400);
  }

  const action = typeof payload === 'object' && payload !== null && 'action' in payload
    ? (payload as { action: string }).action
    : '';
  console.log(`GitHub App: received ${event}.${action} (delivery: ${deliveryId})`);

  // ── Dispatch ────────────────────────────────────────────────────────
  // Use waitUntil for the heavy work so we can respond 200 immediately.
  // GitHub expects a response within 10 seconds.
  const config = DEFAULT_CONFIG;

  switch (event) {
    case 'pull_request': {
      if (['opened', 'synchronize', 'reopened'].includes(action)) {
        c.executionCtx.waitUntil(
          handlePullRequest(payload as PullRequestEvent, c.env, c.executionCtx, config),
        );
      }
      break;
    }

    case 'push': {
      c.executionCtx.waitUntil(
        handlePush(payload as PushEvent, c.env, c.executionCtx, config),
      );
      break;
    }

    case 'installation': {
      c.executionCtx.waitUntil(
        handleInstallation(payload as InstallationEvent, c.env, c.executionCtx),
      );
      break;
    }

    default:
      console.log(`GitHub App: ignoring event type: ${event}`);
  }

  // Respond immediately — handlers run in waitUntil
  return c.json({ received: true, event, delivery: deliveryId });
});

// Health check for the GitHub App endpoint
githubWebhook.get('/health', (c) => {
  return c.json({
    status: 'ok',
    app: 'isitalive-github-app',
    configured: !!c.env.GITHUB_WEBHOOK_SECRET,
  });
});
