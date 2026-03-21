// ---------------------------------------------------------------------------
// Is It Alive? — Main entry point (Cloudflare Worker + Hono)
// ---------------------------------------------------------------------------

import type { Env } from './scoring/types';
import { app } from './app';
import { handleScheduled } from './cron/handler';

export default {
  fetch: app.fetch,
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
