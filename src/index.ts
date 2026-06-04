// ---------------------------------------------------------------------------
// Is It Alive? — Main entry point (Cloudflare Worker + Hono)
// ---------------------------------------------------------------------------

import type { Env } from './types/env';
import { app } from './app';
import { handleScheduled } from './cron/handler';
import { handleEventQueue } from './queue/consumer';
import type { QueuedAnalyticsEvent } from './pipeline/types';

// Surface silent waitUntil/background rejections in Cloudflare Observability.
try {
  addEventListener('unhandledrejection', (event) => {
    const reason = (event as PromiseRejectionEvent).reason
    const err = reason instanceof Error ? reason : new Error(String(reason))
    console.error(JSON.stringify({
      level: 'error',
      msg: 'unhandled_rejection',
      name: err.name,
      message: err.message,
      stack: err.stack ?? null,
    }))
  })
} catch { /* test environments without a global event target */ }

export default {
  fetch: app.fetch,
  async queue(batch: MessageBatch<QueuedAnalyticsEvent>, env: Env, _ctx: ExecutionContext) {
    await handleEventQueue(batch, env);
  },
  async scheduled(event: ScheduledEvent, env: Env, _ctx: ExecutionContext) {
    // Detect daily cron (6 AM UTC) vs every-10-min aggregation
    const trigger = event.cron === '0 6 * * *' ? 'daily' : 'hourly';
    console.log(`Cron: triggered (${trigger}) at ${new Date(event.scheduledTime).toISOString()}`);
    await handleScheduled(env, trigger);
  },
};

// ── Workflow exports ──────────────────────────────────────────────────
export { IngestWorkflow } from './ingest/workflow';
export { RefreshWorkflow } from './ingest/refresh-workflow';
