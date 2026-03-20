// ---------------------------------------------------------------------------
// Edge cache middleware — exact pattern from Cloudflare docs
// https://developers.cloudflare.com/workers/examples/cache-api/
//
// Uses caches.default + request.url as key (the official vanilla pattern).
// ---------------------------------------------------------------------------

import { Context, Next } from 'hono';
import type { Env } from '../scoring/types';

type AppEnv = { Bindings: Env };

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
