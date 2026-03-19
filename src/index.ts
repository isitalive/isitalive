// ---------------------------------------------------------------------------
// Is It Alive? — Main entry point (Cloudflare Worker + Hono)
// ---------------------------------------------------------------------------

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env } from './scoring/types';
import { edgeCache } from './middleware/edgeCache';
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

// Edge cache — full response caching (outermost, before all logic)
app.use('*', edgeCache);

// Auth + rate limit for API routes only
app.use('/api/*', apiKeyAuth);
app.use('/api/*', rateLimit);

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

// ── Health check ──────────────────────────────────────────────────────
app.get('/health', (c) => c.json({ status: 'ok', version: '0.3.0' }));

export default app;

// ── Durable Object exports ────────────────────────────────────────────
export { RateLimiterDO } from './ratelimit/durableObject';
