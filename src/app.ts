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
import { githubWebhook } from './github/webhook';
import { admin } from './routes/admin';
import { ui } from './routes/ui';
import { openApiSpec } from './routes/openapi';
import { llmsTxt, llmsFullTxt } from './routes/llms';
import { aiPluginManifest } from './routes/aiPlugin';

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
app.use('/api/manifest', apiKeyAuth);
app.use('/api/manifest', rateLimit);

app.route('/api/check', check);
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

app.get('/health', (c) => c.json({ status: 'ok', version }));

// Global error handler — content-negotiated response for unhandled exceptions
app.onError((err, c) => {
  console.error('Unhandled error:', err);
  const wantsHtml = (c.req.header('Accept') || '').includes('text/html')
  if (wantsHtml) {
    return c.html(
      '<html><body style="font-family:Inter,sans-serif;background:#0a0a0f;color:#e8e8ed;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0"><div style="text-align:center"><h1>Something went wrong</h1><p style="color:#8b8b9e">Please try again later.</p><a href="/" style="color:#6366f1">← Back to home</a></div></body></html>',
      500,
    )
  }
  return c.json({ error: 'Internal server error' }, 500);
});
