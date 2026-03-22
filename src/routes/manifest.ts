// ---------------------------------------------------------------------------
// POST /api/manifest — synchronous manifest audit endpoint
//
// Accepts a manifest file (go.mod or package.json) and returns a scored
// health report for every dependency. Cache-first and idempotent — calling
// again with the same manifest is instant.
// ---------------------------------------------------------------------------

import { Hono } from 'hono';
import type { Context } from 'hono';
import type { Env } from '../scoring/types';
import type { Tier } from '../cache/index';
import { parseManifest, type ManifestFormat } from '../audit/parsers';
import { resolveAll } from '../audit/resolver';
import { scoreAudit, hashManifest } from '../audit/scorer';
import { buildManifestEvent } from '../events/manifest';
import { buildUsageEvent } from '../events/usage';
import { emitAll } from '../pipeline/emit';

type AppEnv = { Bindings: Env; Variables: { tier: Tier; keyName: string | null; isAuthenticated: boolean } }
const audit = new Hono<AppEnv>();

const SUPPORTED_FORMATS: ManifestFormat[] = ['go.mod', 'package.json'];
const MAX_CONTENT_SIZE = 512 * 1024; // 512 KB

audit.post('/', async (c) => {
  // ── Auth gate — require authentication for API access ──────────────
  const isAuthenticated = c.get('isAuthenticated') ?? false
  if (!isAuthenticated) {
    return c.json({
      error: 'Authentication required',
      hint: 'Get an API key at https://isitalive.dev or use the website to audit manifests for free.',
    }, 401)
  }
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
  const auditCacheKey = `audit:result:${contentHash}`;

  // ── L1: Cloudflare Cache API (edge, ~0ms) ─────────────────────────
  // POST can't use Cache API directly, so we use a synthetic URL keyed
  // by the manifest hash. Same pattern as /api/check.
  const cache = caches.default;
  const syntheticCacheUrl = new Request(`https://cache.isitalive.dev/api/manifest/${contentHash}`);

  const l1Hit = await cache.match(syntheticCacheUrl);
  if (l1Hit) {
    return l1Hit;
  }

  // ── L2: KV cache (global, persistent) ─────────────────────────────
  // Check KV BEFORE parsing/resolving — skips expensive npm lookups.
  // Only complete results are ever written to this key, so no need to
  // parse and re-serialize — return the raw JSON string directly.
  const kvCached = await c.env.CACHE_KV.get(auditCacheKey);
  if (kvCached) {
    // ETag: 304 if client already has this version
    const ifNoneMatch = c.req.header('If-None-Match');
    if (ifNoneMatch === `"${contentHash}"`) {
      return new Response(null, {
        status: 304,
        headers: { ETag: `"${contentHash}"` },
      });
    }

    const response = new Response(kvCached, {
      headers: {
        'Content-Type': 'application/json',
        'ETag': `"${contentHash}"`,
        'Cache-Control': 'public, max-age=3600',
      },
    });
    // Re-populate L1 edge cache for same-datacenter instant hits
    c.executionCtx.waitUntil(cache.put(syntheticCacheUrl, response.clone()));

    // Emit usage events in background — parse cached JSON AFTER response
    // is sent so it doesn't affect latency
    c.executionCtx.waitUntil(emitUsageFromCached(kvCached, c));

    return response;
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
  const response = c.json(result);
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

  // ── Emit events to Pipeline (background) ────────────────────────────
  // Usage events for each scored dep → powers trending + tracked indexes
  // Manifest event → audit analytics
  c.executionCtx.waitUntil((async () => {
    const usageEvents = await Promise.all(
      result.dependencies
        .filter(d => d.score !== null && d.github)
        .map(d => buildUsageEvent(
          d.github!,
          'github',
          d.score!,
          d.verdict,
          {
            source: 'audit',
            apiKey: c.req.header('Authorization')?.replace('Bearer ', '') ?? 'anon',
            cacheStatus: 'n/a',
            responseTimeMs: 0,
            cf: { country: (c.req.raw as any).cf?.country },
            userAgent: c.req.header('User-Agent') ?? null,
            ip: c.req.header('CF-Connecting-IP') ?? null,
          },
        )),
    )

    await emitAll(c.env, {
      usage: usageEvents,
      manifest: [buildManifestEvent({
        manifestHash: contentHash,
        format,
        depCount: deps.length,
        avgScore: result.summary?.avgScore ?? 0,
        conclusion: result.complete ? 'success' : 'partial',
        trigger: 'api',
      })],
    })
  })())

  return response;
});

/**
 * Parse a cached audit result in the background and emit usage events.
 * Called via waitUntil so it doesn't affect response latency.
 */
async function emitUsageFromCached(cachedJson: string, c: Context<AppEnv>): Promise<void> {
  try {
    const result = JSON.parse(cachedJson)
    const scoredDeps = (result.dependencies || []).filter(
      (d: any) => d.score !== null && d.github,
    )
    if (scoredDeps.length === 0) return

    const usageEvents = await Promise.all(
      scoredDeps.map((d: any) => buildUsageEvent(
        d.github,
        'github',
        d.score,
        d.verdict,
        {
          source: 'audit',
          apiKey: c.req.header('Authorization')?.replace('Bearer ', '') ?? 'anon',
          cacheStatus: 'kv-hit',
          responseTimeMs: 0,
          cf: { country: (c.req.raw as any).cf?.country },
          userAgent: c.req.header('User-Agent') ?? null,
          ip: c.req.header('CF-Connecting-IP') ?? null,
        },
      )),
    )

    await emitAll(c.env, { usage: usageEvents })
  } catch {
    // Best effort — don't let usage event failures affect anything
  }
}

export { audit };
