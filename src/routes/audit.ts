// ---------------------------------------------------------------------------
// POST /api/audit — synchronous manifest audit endpoint
//
// Accepts a manifest file (go.mod or package.json) and returns a scored
// health report for every dependency. Cache-first and idempotent — calling
// again with the same manifest is instant.
// ---------------------------------------------------------------------------

import { Hono } from 'hono';
import type { Env } from '../scoring/types';
import { parseManifest, type ManifestFormat } from '../audit/parsers';
import { resolveAll } from '../audit/resolver';
import { scoreAudit, hashManifest } from '../audit/scorer';

const audit = new Hono<{ Bindings: Env }>();

const SUPPORTED_FORMATS: ManifestFormat[] = ['go.mod', 'package.json'];
const MAX_CONTENT_SIZE = 512 * 1024; // 512 KB

audit.post('/', async (c) => {
  // ── Parse request ──────────────────────────────────────────────────
  let body: { format?: string; content?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const { format, content } = body;

  if (!format || !content) {
    return c.json(
      { error: 'Missing required fields: "format" and "content"', supported: SUPPORTED_FORMATS },
      400,
    );
  }

  if (!SUPPORTED_FORMATS.includes(format as ManifestFormat)) {
    return c.json(
      { error: `Unsupported format: "${format}"`, supported: SUPPORTED_FORMATS },
      400,
    );
  }

  if (content.length > MAX_CONTENT_SIZE) {
    return c.json(
      { error: `Content too large (${Math.round(content.length / 1024)}KB). Max: ${MAX_CONTENT_SIZE / 1024}KB` },
      400,
    );
  }

  // ── Hash manifest for caching + ETag ───────────────────────────────
  const contentHash = await hashManifest(content);

  // ── L1: Cloudflare Cache API (edge, ~0ms) ─────────────────────────
  // POST can't use Cache API directly, so we use a synthetic URL keyed
  // by the manifest hash. Same pattern as /api/check.
  const cache = caches.default;
  const syntheticCacheUrl = new Request(`https://cache.isitalive.dev/api/audit/${contentHash}`);

  const l1Hit = await cache.match(syntheticCacheUrl);
  if (l1Hit) {
    return l1Hit;
  }

  // ETag: if client sends If-None-Match and we have a cached complete result
  const ifNoneMatch = c.req.header('If-None-Match');
  if (ifNoneMatch === `"${contentHash}"`) {
    const cached = await c.env.CACHE_KV.get(`audit:result:${contentHash}`);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (parsed.complete) {
        return new Response(null, {
          status: 304,
          headers: { ETag: `"${contentHash}"` },
        });
      }
    }
  }

  // ── Parse manifest ─────────────────────────────────────────────────
  let deps;
  try {
    deps = parseManifest(format as ManifestFormat, content);
  } catch (err: any) {
    return c.json({ error: `Parse error: ${err.message}` }, 400);
  }

  if (deps.length === 0) {
    return c.json({
      auditHash: contentHash,
      complete: true,
      format,
      scored: 0,
      total: 0,
      pending: 0,
      unresolved: 0,
      summary: { healthy: 0, stable: 0, degraded: 0, critical: 0, unmaintained: 0, avgScore: 0 },
      dependencies: [],
    });
  }

  // ── Resolve → GitHub repos ─────────────────────────────────────────
  const resolved = await resolveAll(deps, c.env);

  // ── Score with time budget ─────────────────────────────────────────
  const result = await scoreAudit(
    resolved,
    format,
    contentHash,
    c.env,
    c.executionCtx,
  );

  // ── Response ───────────────────────────────────────────────────────
  const response = c.json(result, result.complete ? 200 : 200);
  response.headers.set('ETag', `"${contentHash}"`);
  response.headers.set('Cache-Control', result.complete
    ? 'public, max-age=3600'
    : 'no-cache',
  );
  if (!result.complete && result.retryAfterMs) {
    response.headers.set('Retry-After', String(Math.ceil(result.retryAfterMs / 1000)));
  }

  // ── Write to L1 edge cache if complete ─────────────────────────────
  if (result.complete) {
    c.executionCtx.waitUntil(cache.put(syntheticCacheUrl, response.clone()));
  }

  // ── Archive raw manifest to R2 (background) ───────────────────────
  const ext = format === 'go.mod' ? 'gomod' : 'json';
  const r2Key = `audits/${contentHash}/${new Date().toISOString()}.${ext}`;
  c.executionCtx.waitUntil(
    c.env.RAW_DATA.put(r2Key, content, {
      customMetadata: {
        format,
        depCount: String(deps.length),
        hash: contentHash,
      },
    }).catch(() => {}), // best effort
  );

  return response;
});

export { audit };
