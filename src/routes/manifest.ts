// ---------------------------------------------------------------------------
// /api/manifest — manifest audit endpoint
//
// POST /api/manifest — submit a manifest for scoring (auth required)
//
// Accepts X-Manifest-Hash header for fast-path cache lookup BEFORE parsing the
// JSON body. If the hash matches a cached result, returns immediately (<1ms CPU).
// Supports If-None-Match → 304 for ETag-based client caching.
//
// GET /api/manifest/hash/:hash was removed in ADR-006 — Workers always wake
// up, so the GET was a redundant round-trip at the same $0.30/M cost.
// ---------------------------------------------------------------------------

import { Hono } from 'hono';
import type { Context } from 'hono';
import type { Env } from '../scoring/types';
import type { Tier } from '../cache/index';
import type { OidcClaims } from '../github/oidc';
import { parseManifest, type ManifestFormat } from '../audit/parsers';
import { resolveAll } from '../audit/resolver';
import { scoreAudit, hashManifest } from '../audit/scorer';
import { buildManifestEvent } from '../events/manifest';
import { buildUsageEvent } from '../events/usage';
import { emitAll } from '../pipeline/emit';

type AppEnv = { Bindings: Env; Variables: { tier: Tier; keyName: string | null; isAuthenticated: boolean; oidcClaims: OidcClaims | null } }
const audit = new Hono<AppEnv>();

const SUPPORTED_FORMATS: ManifestFormat[] = ['go.mod', 'package.json'];
const MAX_CONTENT_SIZE = 512 * 1024; // 512 KB
const OIDC_FREE_QUOTA_LIMIT = 500; // deps scored/month per public repo (ADR-004)

// ---------------------------------------------------------------------------
// POST /api/manifest — submit manifest for scoring (auth required)
//
// Fast path: if X-Manifest-Hash header is present, checks L1/L2 cache BEFORE
// parsing the JSON body — returns in <1ms CPU on cache hits.
// ---------------------------------------------------------------------------

audit.post('/', async (c) => {
  // ── Auth gate — require authentication for API access ──────────────
  const isAuthenticated = c.get('isAuthenticated') ?? false
  if (!isAuthenticated) {
    return c.json({
      error: 'Authentication required',
      hint: 'Get an API key at https://isitalive.dev or use the website to audit manifests for free.',
    }, 401)
  }

  // ── OIDC quota enforcement — read KV counter (populated by cron) ───
  const oidcClaims = c.get('oidcClaims') ?? null
  if (oidcClaims) {
    const quotaEntry = await c.env.CACHE_KV.get(`oidc:quota:${oidcClaims.repository}`, 'json') as { used: number; limit?: number; period: string } | null
    const limit = quotaEntry?.limit ?? OIDC_FREE_QUOTA_LIMIT
    if (quotaEntry && quotaEntry.used >= limit) {
      return c.json({
        error: 'OIDC quota exceeded',
        used: quotaEntry.used,
        limit,
        period: quotaEntry.period,
        hint: 'Add an ISITALIVE_API_KEY secret for higher limits. See https://isitalive.dev/docs/api-keys',
      }, 429)
    }
  }

  // ── FAST PATH: X-Manifest-Hash header check BEFORE parsing body (ADR-006)
  // If the client sends a hash, we can check L1/L2 cache without the cost of
  // JSON.parse() on the request body. Saves ~50ms CPU on cache hits.
  const clientHash = c.req.header('X-Manifest-Hash');
  if (clientHash && /^[a-f0-9]{64}$/.test(clientHash)) {
    const auditCacheKey = `audit:result:${clientHash}`;
    const syntheticCacheUrl = new Request(`https://cache.isitalive.dev/api/manifest/${clientHash}`);
    const cache = caches.default;

    // L1: Cache API hit (Worker-internal, free ops)
    const l1Hit = await cache.match(syntheticCacheUrl);
    if (l1Hit) {
      if (c.req.header('If-None-Match') === `"${clientHash}"`) {
        return new Response(null, { status: 304, headers: { ETag: `"${clientHash}"` } });
      }
      return l1Hit;
    }

    // L2: KV cache hit
    const kvCached = await c.env.CACHE_KV.get(auditCacheKey);
    if (kvCached) {
      if (c.req.header('If-None-Match') === `"${clientHash}"`) {
        return new Response(null, { status: 304, headers: { ETag: `"${clientHash}"` } });
      }

      // Return raw cached string directly (0 CPU parse time)
      const response = new Response(kvCached, {
        headers: {
          'Content-Type': 'application/json',
          'ETag': `"${clientHash}"`,
          'Cache-Control': 'public, max-age=3600',
        },
      });
      c.executionCtx.waitUntil(cache.put(syntheticCacheUrl, response.clone()));
      c.executionCtx.waitUntil(emitUsageFromCached(kvCached, c));
      return response;
    }
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
    // is sent so it doesn't affect latency.
    // NOTE: these events have cacheStatus='kv-hit' so quota aggregation
    // cron must exclude them (ADR-004: only Layer 3 misses consume quota).
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
      freshlyScored: 0,
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
            apiKey: c.get('keyName') ?? 'anon',
            cacheStatus: 'n/a',
            responseTimeMs: 0,
            cf: { country: (c.req.raw as any).cf?.country },
            userAgent: c.req.header('User-Agent') ?? null,
            ip: c.req.header('CF-Connecting-IP') ?? null,
            oidcRepository: oidcClaims?.repository ?? null,
            oidcOwner: oidcClaims?.repository_owner ?? null,
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

    const oidcClaims = c.get('oidcClaims') ?? null

    const usageEvents = await Promise.all(
      scoredDeps.map((d: any) => buildUsageEvent(
        d.github,
        'github',
        d.score,
        d.verdict,
        {
          source: 'audit',
          apiKey: c.get('keyName') ?? 'anon',
          cacheStatus: 'kv-hit',
          responseTimeMs: 0,
          cf: { country: (c.req.raw as any).cf?.country },
          userAgent: c.req.header('User-Agent') ?? null,
          ip: c.req.header('CF-Connecting-IP') ?? null,
          oidcRepository: oidcClaims?.repository ?? null,
          oidcOwner: oidcClaims?.repository_owner ?? null,
        },
      )),
    )

    await emitAll(c.env, { usage: usageEvents })
  } catch {
    // Best effort — don't let usage event failures affect anything
  }
}

export { audit };
