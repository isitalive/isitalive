// ---------------------------------------------------------------------------
// Is It Alive? — Main entry point (Cloudflare Worker + Hono)
// ---------------------------------------------------------------------------

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env } from './scoring/types';
import { cacheTest } from './middleware/edgeCache';
import { apiKeyAuth } from './middleware/auth';
import { rateLimit } from './middleware/rateLimit';
import { check } from './routes/check';
import { badge } from './routes/badge';
import { ui } from './routes/ui';
import { openApiSpec } from './routes/openapi';
import { llmsTxt, llmsFullTxt } from './routes/llms';
import { aiPluginManifest } from './routes/aiPlugin';

const app = new Hono<{ Bindings: Env }>();

// ── Global middleware ─────────────────────────────────────────────────
app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  maxAge: 86400,
}));

// Auth + rate limit only for API routes
app.use('/api/*', apiKeyAuth);
app.use('/api/*', rateLimit);

// UI routes are protected by Turnstile (on POST) or cached (on GET)
// No global rate limit for UI repo pages to ensure good UX for visitors.

// ── API routes ────────────────────────────────────────────────────────
app.route('/api/check', check);
app.route('/api/badge', badge);

// ── Web UI routes ─────────────────────────────────────────────────────
app.route('/', ui);

// ── AI agent discovery endpoints ──────────────────────────────────
app.get('/openapi.json', (c) => {
  c.header('Cache-Control', 'public, max-age=86400, s-maxage=86400');
  return c.json(openApiSpec);
});

app.get('/llms.txt', (c) => {
  c.header('Cache-Control', 'public, max-age=86400, s-maxage=86400');
  c.header('Content-Type', 'text/plain; charset=utf-8');
  return c.text(llmsTxt);
});

app.get('/llms-full.txt', (c) => {
  c.header('Cache-Control', 'public, max-age=86400, s-maxage=86400');
  c.header('Content-Type', 'text/plain; charset=utf-8');
  return c.text(llmsFullTxt);
});

app.get('/.well-known/ai-plugin.json', (c) => {
  c.header('Cache-Control', 'public, max-age=86400, s-maxage=86400');
  return c.json(aiPluginManifest);
});

// ── Cache API test ────────────────────────────────────────────────────
app.get('/_cache_test', cacheTest);

// ── Health check ──────────────────────────────────────────────────────
app.get('/health', (c) => c.json({ status: 'ok', version: '0.4.0' }));

// ── Export Worker ─────────────────────────────────────────────────────
import { handleScheduled } from './cron/handler';

export default {
  fetch: app.fetch,
  async scheduled(event: ScheduledEvent, env: Env, _ctx: ExecutionContext) {
    // Detect daily cron (6 AM UTC) vs hourly
    const trigger = event.cron === '0 6 * * *' ? 'daily' : 'hourly';
    console.log(`Cron: triggered (${trigger}) at ${new Date(event.scheduledTime).toISOString()}`);
    await handleScheduled(env, trigger);
  },
};

// ── Workflow exports ──────────────────────────────────────────────────
export { IngestWorkflow } from './ingest/workflow';
