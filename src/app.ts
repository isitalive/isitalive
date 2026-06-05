import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';
import { etag } from 'hono/etag';
import type { Env } from './types/env';
import { version } from '../package.json';
import { apiKeyAuth } from './middleware/auth';
import { rateLimit } from './middleware/rateLimit';
import { check } from './routes/check';
import { badge } from './routes/badge';
import { audit } from './routes/manifest';
import { packageCheck, packageResolve } from './routes/package';
import { githubWebhook } from './github/webhook';
import { admin } from './routes/admin';
import { ui } from './routes/ui';
import { openApiSpec } from './routes/openapi';
import { llmsTxt, llmsFullTxt } from './routes/llms';
import { aiPluginManifest } from './routes/aiPlugin';
import { d1ReplicationDiagnostic, readReplicaSafeSession, type D1ReplicationDiagnostic } from './db/d1'

const HEALTH_PROBE_TIMEOUT_MS = 500;

export const app = new Hono<{ Bindings: Env }>();

// Security headers — applied globally via Hono's secureHeaders middleware
app.use('*', secureHeaders({
  xFrameOptions: 'DENY',
  referrerPolicy: 'strict-origin-when-cross-origin',
  contentSecurityPolicy: {
    defaultSrc: ["'none'"],
    scriptSrc: ["'self'", 'https://challenges.cloudflare.com', 'https://cdn.jsdelivr.net', "'unsafe-inline'"],
    styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com', 'https://cdn.jsdelivr.net'],
    fontSrc: ["'self'", 'https://fonts.gstatic.com'],
    imgSrc: ["'self'", 'data:', 'https://img.shields.io'],
    connectSrc: ["'self'", 'https://challenges.cloudflare.com'],
    frameSrc: ['https://challenges.cloudflare.com'],
    workerSrc: ["'self'", 'blob:'],
    frameAncestors: ["'none'"],
    baseUri: ["'self'"],
    formAction: ["'self'"],
  },
  permissionsPolicy: {
    camera: false,
    microphone: false,
    geolocation: false,
  },
}));

// CORS — scoped to API routes only (admin excluded)
app.use('/api/*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  maxAge: 86400,
}));

// Auth + rate limiting — skip badge (CDN-cached, embedded as <img> tags)
app.use('/api/check/*', apiKeyAuth);
app.use('/api/check/*', rateLimit);
app.use('/api/resolve/*', apiKeyAuth);
app.use('/api/resolve/*', rateLimit);
app.use('/api/manifest', apiKeyAuth);
app.use('/api/manifest', rateLimit);
app.use('/_data/deps/*', apiKeyAuth);
app.use('/_data/deps/*', rateLimit);
app.use('/_view', apiKeyAuth);
app.use('/_view', rateLimit);

app.route('/api/check', check);
app.route('/api/check/package', packageCheck);
app.route('/api/resolve', packageResolve);
app.route('/api/badge', badge);
app.route('/api/manifest', audit);

// Deprecation redirect: /api/audit → /api/manifest
app.all('/api/audit', (c) => {
  const url = new URL(c.req.url)
  url.pathname = url.pathname.replace('/api/audit', '/api/manifest')
  return c.redirect(url.toString(), 308)
});
app.route('/github', githubWebhook);
app.route('/admin', admin);
app.route('/', ui);

// ETag — conditional caching for slow-changing endpoints
app.use('/openapi.json', etag());
app.use('/llms.txt', etag());
app.use('/llms-full.txt', etag());
app.use('/.well-known/ai-plugin.json', etag());

app.get('/openapi.json', (c) => {
  c.header('Cache-Control', 'public, max-age=86400, s-maxage=86400');
  c.header('CDN-Cache-Control', 'public, s-maxage=86400');
  return c.json(openApiSpec);
});

app.get('/llms.txt', (c) => {
  c.header('Cache-Control', 'public, max-age=86400, s-maxage=86400');
  c.header('CDN-Cache-Control', 'public, s-maxage=86400');
  c.header('Content-Type', 'text/plain; charset=utf-8');
  return c.text(llmsTxt);
});

app.get('/llms-full.txt', (c) => {
  c.header('Cache-Control', 'public, max-age=86400, s-maxage=86400');
  c.header('CDN-Cache-Control', 'public, s-maxage=86400');
  c.header('Content-Type', 'text/plain; charset=utf-8');
  return c.text(llmsFullTxt);
});

app.get('/.well-known/ai-plugin.json', (c) => {
  c.header('Cache-Control', 'public, max-age=86400, s-maxage=86400');
  c.header('CDN-Cache-Control', 'public, s-maxage=86400');
  return c.json(aiPluginManifest);
});

app.get('/health', async (c) => {
  c.header('Cache-Control', 'no-store');
  const start = Date.now();
  let db: 'ok' | 'degraded' = 'degraded';
  let kv: 'ok' | 'degraded' | undefined;
  let d1: D1ReplicationDiagnostic | undefined;
  try {
    const legacyKv = (c.env as unknown as { CACHE_KV?: KVNamespace }).CACHE_KV
    if (c.env.DB) {
      const reader = readReplicaSafeSession(c.env.DB)
      const result = await Promise.race([
        reader.prepare('SELECT 1 as ok').all<{ ok: number }>(),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('health probe timeout')), HEALTH_PROBE_TIMEOUT_MS)),
      ])
      d1 = d1ReplicationDiagnostic(reader, result)
    } else if (legacyKv) {
      await Promise.race([
        legacyKv.get('health:ping'),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('health probe timeout')), HEALTH_PROBE_TIMEOUT_MS)),
      ])
    } else {
      throw new Error('no storage binding configured')
    }
    db = 'ok';
    if (!c.env.DB) kv = 'ok';
  } catch {
    if (!c.env.DB) kv = 'degraded';
  }
  const body = d1
    ? { status: db, db, kv, version, probeMs: Date.now() - start, d1 }
    : { status: db, db, kv, version, probeMs: Date.now() - start }
  return c.json(body, db === 'ok' ? 200 : 503);
});

// Global error handler — content-negotiated response for unhandled exceptions.
// Logs a single JSON line (indexed by Cloudflare Observability) with request
// metadata so failures are triageable from logs alone.
app.onError((err, c) => {
  const errObj = err instanceof Error ? err : new Error(String(err))
  let path: string | null = null
  try {
    path = new URL(c.req.url).pathname
  } catch {
    path = c.req.path ?? null
  }
  let tier: string | null = null
  try {
    tier = (c.get as (k: string) => unknown)('tier') as string | null
  } catch {
    tier = null
  }
  console.error(JSON.stringify({
    level: 'error',
    msg: 'unhandled_error',
    name: errObj.name,
    message: errObj.message,
    stack: errObj.stack,
    method: c.req.method,
    path,
    userAgent: c.req.header('User-Agent') ?? null,
    cfRay: c.req.header('CF-Ray') ?? null,
    tier,
  }))
  const wantsHtml = (c.req.header('Accept') || '').includes('text/html')
  if (wantsHtml) {
    return c.html(
      '<html><body style="font-family:Inter,sans-serif;background:#0a0a0f;color:#e8e8ed;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0"><div style="text-align:center"><h1>Something went wrong</h1><p style="color:#8b8b9e">Please try again later.</p><a href="/" style="color:#6366f1">← Back to home</a></div></body></html>',
      500,
    )
  }
  return c.json({ error: 'Internal server error' }, 500);
});
