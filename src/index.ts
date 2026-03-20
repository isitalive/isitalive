// ---------------------------------------------------------------------------
// Is It Alive? — Main entry point (Cloudflare Worker + Hono)
// ---------------------------------------------------------------------------

import type { Env } from './scoring/types';
import { app } from './app';
// ── Export Worker ─────────────────────────────────────────────────────
import { handleScheduled } from './cron/handler';
import { handleQueueBatch } from './queue/consumer';
import type { QueueMessage } from './queue/types';

export default {
  fetch: app.fetch,
  async scheduled(event: ScheduledEvent, env: Env, _ctx: ExecutionContext) {
    // Detect daily cron (6 AM UTC) vs hourly
    const trigger = event.cron === '0 6 * * *' ? 'daily' : 'hourly';
    console.log(`Cron: triggered (${trigger}) at ${new Date(event.scheduledTime).toISOString()}`);
    await handleScheduled(env, trigger);
  },
  async queue(batch: MessageBatch<QueueMessage>, env: Env) {
    await handleQueueBatch(batch, env);
  },
};

// ── Workflow exports ──────────────────────────────────────────────────
export { IngestWorkflow } from './ingest/workflow';
export { RefreshWorkflow } from './ingest/refresh-workflow';
