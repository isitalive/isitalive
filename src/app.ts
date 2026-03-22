import { Hono } from 'hono';
import { cors } from 'hono/cors';
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

// Security headers — applied globally
app.use('*', async (c, next) => {
  await next();
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('X-Frame-Options', 'DENY');
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  c.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  c.header(
    'Content-Security-Policy',
    [
      "default-src 'none'",
      "script-src 'self' https://challenges.cloudflare.com https://static.cloudflareinsights.com https://cdn.jsdelivr.net 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: https://img.shields.io",
      "connect-src 'self' https://challenges.cloudflare.com https://cloudflareinsights.com",
      "frame-src https://challenges.cloudflare.com",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; '),
  );
});

// CORS — scoped to API routes only (admin excluded)
app.use('/api/*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  maxAge: 86400,
}));

app.use('/api/*', apiKeyAuth);
app.use('/api/*', rateLimit);

app.route('/api/check', check);
app.route('/api/badge', badge);
app.route('/api/manifest', audit);

// Deprecation redirect: /api/audit → /api/manifest
app.all('/api/audit', (c) => {
  const url = new URL(c.req.url)
  url.pathname = url.pathname.replace('/api/audit', '/api/manifest')
  return c.redirect(url.toString(), 301)
});
app.route('/github', githubWebhook);
app.route('/admin', admin);
app.route('/', ui);

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

app.get('/health', (c) => c.json({ status: 'ok', version }));
