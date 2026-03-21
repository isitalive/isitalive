import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env } from './scoring/types';
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

app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  maxAge: 86400,
}));

app.use('/api/*', apiKeyAuth);
app.use('/api/*', rateLimit);

app.route('/api/check', check);
app.route('/api/badge', badge);
app.route('/api/audit', audit);
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

app.get('/health', (c) => c.json({ status: 'ok', version: '0.4.0' }));
