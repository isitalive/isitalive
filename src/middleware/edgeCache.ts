// ---------------------------------------------------------------------------
// Edge cache middleware — caches full HTTP responses in the Cache API
//
// On GET requests, checks the Cache API first. If found, returns the cached
// response instantly (~1-5ms) without running any Worker logic.
// On miss, runs the handler, then caches the response for next time.
//
// This is the outermost cache layer — sits in front of everything:
//   Edge Cache (full response) → Worker logic → L1/L2 data cache → GitHub
// ---------------------------------------------------------------------------

import { Context, Next } from 'hono';
import type { Env } from '../scoring/types';

type AppEnv = { Bindings: Env };

/**
 * Edge cache middleware for full HTML/JSON responses.
 * Only caches successful GET responses that have a Cache-Control header.
 */
export async function edgeCache(c: Context<AppEnv>, next: Next) {
  // Only cache GET requests
  if (c.req.method !== 'GET') {
    return next();
  }

  // Skip caching for API routes with auth (responses vary by API key)
  const url = new URL(c.req.url);
  if (url.pathname.startsWith('/api/') && c.req.header('Authorization')) {
    return next();
  }

  try {
    const cache = caches.default;
    const cacheKey = new Request(c.req.url, {
      method: 'GET',
      headers: {},  // Strip request headers so cache key is URL-only
    });

    // Check edge cache
    const cachedResponse = await cache.match(cacheKey);
    if (cachedResponse) {
      // Clone and add cache indicator header
      const response = new Response(cachedResponse.body, cachedResponse);
      response.headers.set('X-Edge-Cache', 'HIT');
      return response;
    }

    // Cache miss — run the actual handler
    await next();

    // Only cache successful responses with Cache-Control
    if (c.res.ok && c.res.headers.get('Cache-Control')) {
      const responseToCache = c.res.clone();
      c.executionCtx.waitUntil(cache.put(cacheKey, responseToCache));
      c.res.headers.set('X-Edge-Cache', 'MISS');
    }
  } catch {
    // Cache API not available (local dev) — just run handler
    await next();
  }
}
