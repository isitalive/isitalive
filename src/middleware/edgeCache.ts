// ---------------------------------------------------------------------------
// Edge cache middleware — exact pattern from Cloudflare docs
// https://developers.cloudflare.com/workers/examples/cache-api/
//
// Uses caches.default + request.url as key (the official vanilla pattern).
// ---------------------------------------------------------------------------

import { Context, Next } from 'hono';
import type { Env } from '../scoring/types';

type AppEnv = { Bindings: Env };

/**
 * Minimal Cache API test — isolated from all other logic.
 * Wire up: app.get('/_cache_test', cacheTest)
 */
export async function cacheTest(c: Context<AppEnv>) {
  const cache = caches.default;
  const testUrl = `https://isitalive.dev/__cache_test_key`;
  const testKey = new Request(testUrl);

  // Step 1: Try to match existing cache entry
  const existing = await cache.match(testKey);
  if (existing) {
    const body = await existing.text();
    return c.json({ cacheWorking: true, source: 'cache', body, ts: Date.now() });
  }

  // Step 2: Put a simple response into cache
  const resp = new Response(JSON.stringify({ hello: 'cache', ts: Date.now() }), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, s-maxage=60',
    },
  });
  await cache.put(testKey, resp);

  // Step 3: Immediately try to match
  const check = await cache.match(testKey);
  return c.json({
    cacheWorking: !!check,
    source: 'fresh-put-then-match',
    matchFound: !!check,
    ts: Date.now(),
  });
}

export async function edgeCache(c: Context<AppEnv>, next: Next) {
  // Only cache GET requests
  if (c.req.method !== 'GET') {
    return next();
  }

  // 1. Set up the Cache API
  const cache = caches.default;
  // Cloudflare expects a standard Request object as the cache key
  // CRITICAL: Do NOT copy original headers, create a pristine Request!
  const cacheKey = new Request(c.req.url);

  // 2. Check if it's already in the cache
  const cachedResponse = await cache.match(cacheKey);
  if (cachedResponse) {
    console.log(`⚡ Cache HIT for: ${c.req.url}`);
    return cachedResponse;
  }

  console.log(`🐌 Cache MISS. Fetching fresh data for: ${c.req.url}`);

  // 3. Run the downstream handler to generate the response
  await next();

  if (c.res.ok) {
    // 4. We have a Hono response. We must explicitly attach Cache-Control
    // We clone the response into a new one to safely mutate headers
    const cacheResponse = new Response(c.res.body, c.res);
    
    const existingCC = cacheResponse.headers.get('Cache-Control') || '';
    if (!existingCC.includes('s-maxage=')) {
      cacheResponse.headers.set(
        'Cache-Control', 
        existingCC ? `${existingCC}, s-maxage=3600` : 'public, s-maxage=3600'
      );
    } else {
      cacheResponse.headers.set('Cache-Control', existingCC);
    }

    // 5. Put a CLONED copy into the cache without blocking the user response
    c.executionCtx.waitUntil(cache.put(cacheKey, cacheResponse.clone()));
    
    // 6. Return the original (header-mutated) response to the user
    c.res = cacheResponse;
  }
}

