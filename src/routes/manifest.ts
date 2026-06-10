// ---------------------------------------------------------------------------
// /api/manifest — manifest audit endpoint
//
// POST /api/manifest — submit a manifest for scoring (auth required)
//
// The audit hash and ETag are derived from the submitted `content` field.
// If-None-Match can return 304 on whole-audit cache hits. Request-specific
// policy/freshness controls bypass whole-audit result caches so responses
// remain deterministic.
//
// GET /api/manifest/hash/:hash was removed in ADR-006 — Workers always wake
// up, so the GET was a redundant round-trip at the same $0.30/M cost.
// ---------------------------------------------------------------------------

import { Hono } from 'hono';
import type { Context } from 'hono';
import type { Env } from '../types/env';
import type { Tier } from '../cache/index';
import type { OidcClaims } from '../github/oidc';
import { parseManifest, type ManifestFormat } from '../audit/parsers';
import { resolveAll } from '../audit/resolver';
import { buildAuditCacheKey, buildAuditCacheUrl, scoreAudit, hashManifest, type AuditResult } from '../audit/scorer';
import { buildManifestEvent } from '../events/manifest';
import { buildUsageEvent } from '../events/usage';
import { emitAll } from '../pipeline/emit';
import { readBodyWithByteLimit, RequestBodyTooLargeError } from '../utils/http';
import { includeKey, parseIncludeFlags, shapeAuditResult, type IncludeFlags } from '../utils/healthResponse';
import { METHODOLOGY } from '../scoring/methodology';
import { auditCacheDelete, auditCacheGetText } from '../db/state';
import { parseAuditRequestOptions } from '../audit/requestOptions';

type AppEnv = { Bindings: Env; Variables: { tier: Tier; keyName: string | null; isAuthenticated: boolean; oidcClaims: OidcClaims | null } }
const audit = new Hono<AppEnv>();

const SUPPORTED_FORMATS: ManifestFormat[] = ['go.mod', 'go.sum', 'package.json', 'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock'];
const MAX_CONTENT_SIZE = 512 * 1024; // 512 KB
const MAX_REQUEST_BODY_BYTES = 576 * 1024; // ~576 KB total JSON payload

function buildCachedAuditResponse(
  cachedJson: string,
  contentHash: string,
  ifNoneMatch: string | undefined,
  flags: IncludeFlags,
): Response | null {
  let cachedResult: AuditResult | null = null

  try {
    cachedResult = JSON.parse(cachedJson) as AuditResult
  } catch {
    return null
  }

  if (cachedResult?.complete && ifNoneMatch === `"${contentHash}"`) {
    return new Response(null, {
      status: 304,
      headers: { ETag: `"${contentHash}"` },
    })
  }

  const response = new Response(JSON.stringify(shapeAuditResult(cachedResult, flags)), {
    headers: {
      'Content-Type': 'application/json',
      'ETag': `"${contentHash}"`,
      'Cache-Control': cachedResult?.complete ? 'public, max-age=3600' : 'no-cache',
    },
  })

  if (!cachedResult?.complete && cachedResult?.retryAfterMs) {
    response.headers.set('Retry-After', String(Math.ceil(cachedResult.retryAfterMs / 1000)))
  }

  return response
}

// ---------------------------------------------------------------------------
// POST /api/manifest — submit manifest for scoring (auth required)
//
// Whole-audit cache hits are served only after parsing the request body so
// policy and freshness controls can intentionally bypass cached base results.
// ---------------------------------------------------------------------------

audit.post('/', async (c) => {
  const includeFlags = parseIncludeFlags(c.req.url)
  const includeCacheKey = includeKey(includeFlags)
  // ── Auth gate — require authentication for API access ──────────────
  const isAuthenticated = c.get('isAuthenticated') ?? false
  if (!isAuthenticated) {
    return c.json({
      error: 'Authentication required',
      hint: 'Manifest audits require authenticated free access: use an IsItAlive API key or GitHub Actions OIDC for public repositories.',
    }, 401)
  }
  const oidcClaims = c.get('oidcClaims') ?? null

  // ── Parse request ──────────────────────────────────────────────────
  let body: { format?: string; content?: string; policy?: unknown; maxAgeSeconds?: unknown; preferFresh?: unknown };
  try {
    const rawBody = await readBodyWithByteLimit(c.req.raw, MAX_REQUEST_BODY_BYTES)
    body = JSON.parse(rawBody || '{}')
  } catch (err) {
    if (err instanceof RequestBodyTooLargeError) {
      return c.json({ error: 'Payload too large', error_code: 'payload_too_large' }, 413)
    }
    return c.json({ error: 'Invalid JSON body', error_code: 'invalid_json' }, 400);
  }

  const { format, content } = body;
  const optionResult = parseAuditRequestOptions(body as Record<string, unknown>)
  if (optionResult.error) {
    return c.json({ error: optionResult.error.message, error_code: optionResult.error.error_code }, 400)
  }
  const hasRequestOptions = Boolean(
    optionResult.options.policy ||
    optionResult.options.maxAgeSeconds !== undefined ||
    optionResult.options.preferFresh,
  )

  if (!format || !content) {
    return c.json(
      { error: 'Missing required fields: "format" and "content"', error_code: 'invalid_param', supported: SUPPORTED_FORMATS },
      400,
    );
  }

  if (!SUPPORTED_FORMATS.includes(format as ManifestFormat)) {
    return c.json(
      { error: `Unsupported format: "${format}"`, error_code: 'unsupported_format', supported: SUPPORTED_FORMATS },
      400,
    );
  }

  if (content.length > MAX_CONTENT_SIZE) {
    return c.json(
      { error: `Content too large (${Math.round(content.length / 1024)}KB). Max: ${MAX_CONTENT_SIZE / 1024}KB`, error_code: 'content_too_large' },
      400,
    );
  }

  // ── Hash manifest for caching + ETag ───────────────────────────────
  const contentHash = await hashManifest(content);
  const auditCacheKey = buildAuditCacheKey(contentHash);

  // ── L1: Cloudflare Cache API (edge, ~0ms) ─────────────────────────
  // POST can't use Cache API directly, so we use a synthetic URL keyed
  // by the manifest hash. Same pattern as /api/check.
  const cache = caches.default;
  const syntheticCacheUrl = buildAuditCacheUrl(contentHash, includeCacheKey);

  if (!hasRequestOptions) {
    const l1Hit = await cache.match(syntheticCacheUrl);
    if (l1Hit) {
      return l1Hit;
    }
  }

  // ── L2: D1 cache (persistent) ────────────────────────────────────
  // Check D1 BEFORE parsing/resolving — skips expensive npm lookups.
  // Only complete results are ever written to this key, so no need to
  // parse and re-serialize — return the raw JSON string directly.
  const d1Cached = hasRequestOptions ? null : await auditCacheGetText(c.env, auditCacheKey);
  if (d1Cached) {
    const response = buildCachedAuditResponse(d1Cached, contentHash, c.req.header('If-None-Match'), includeFlags)
    if (!response) {
      c.executionCtx.waitUntil(auditCacheDelete(c.env, auditCacheKey))
    } else {
      if (response.headers.get('Cache-Control') !== 'no-cache') {
        c.executionCtx.waitUntil(cache.put(syntheticCacheUrl, response.clone()))
      }

      // Emit usage events in background — parse cached JSON AFTER response
      // is sent so it doesn't affect latency.
      // NOTE: these events have cacheStatus='l2-hit' so analytics can
      // distinguish cached audits from fresh dependency scoring work.
      c.executionCtx.waitUntil(emitUsageFromCached(d1Cached, c));
      return response;
    }
  }

  // ── Parse manifest ─────────────────────────────────────────────────
  let deps;
  try {
    deps = parseManifest(format as ManifestFormat, content);
  } catch {
    return c.json({ error: 'Invalid manifest format', error_code: 'invalid_manifest' }, 400);
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
      methodology: METHODOLOGY,
      summary: { healthy: 0, stable: 0, degraded: 0, critical: 0, unmaintained: 0, avgScore: 0 },
      dependencies: [],
    });
  }

  // ── Resolve → GitHub repos ─────────────────────────────────────────
  const resolved = await resolveAll(deps, c.env, c.executionCtx);

  // ── Score with time budget ─────────────────────────────────────────
  const result = await scoreAudit(
    resolved,
    format,
    contentHash,
    c.env,
    c.executionCtx,
    {
      tier: c.get('tier') ?? 'free',
      ...optionResult.options,
    },
  );

  // ── Response ───────────────────────────────────────────────────────
  const response = c.json(shapeAuditResult(result, includeFlags));
  response.headers.set('ETag', `"${contentHash}"`);
  response.headers.set('Cache-Control', result.complete
    ? 'public, max-age=3600'
    : 'no-cache',
  );
  if (!result.complete && result.retryAfterMs) {
    response.headers.set('Retry-After', String(Math.ceil(result.retryAfterMs / 1000)));
  }

  // ── Write to L1 edge cache if complete ─────────────────────────────
  if (!hasRequestOptions && result.complete) {
    c.executionCtx.waitUntil(cache.put(syntheticCacheUrl, response.clone()));
  }

  // ── Emit events to queue (background) ───────────────────────────────
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
          cacheStatus: 'l2-hit',
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
