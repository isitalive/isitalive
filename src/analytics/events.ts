// ---------------------------------------------------------------------------
// Analytics event pipeline — writes to Cloudflare Pipeline (→ R2 Iceberg)
// and archives raw GitHub JSON to R2
//
// Pipeline binding provides a native Worker write path into R2 Iceberg
// tables. Events are buffered, batched, and written as Parquet files
// with full Iceberg metadata. Queryable via R2 SQL.
//
// Called via waitUntil on every request (cache hits included for demand
// analytics). Raw GitHub JSON only archived on fresh fetches.
// ---------------------------------------------------------------------------

import type { Env, ScoringResult } from '../scoring/types';

/** Classify User-Agent into broad categories */
function classifyUserAgent(ua: string | null): string {
  if (!ua) return 'unknown';
  const lower = ua.toLowerCase();
  if (lower.includes('bot') || lower.includes('crawler') || lower.includes('spider')) return 'bot';
  if (lower.includes('curl') || lower.includes('wget') || lower.includes('httpie')) return 'cli';
  if (lower.includes('langchain') || lower.includes('openai') || lower.includes('anthropic') ||
      lower.includes('autogpt') || lower.includes('crewai')) return 'agent';
  if (lower.includes('mozilla') || lower.includes('chrome') || lower.includes('safari')) return 'browser';
  return 'other';
}

export interface CheckEventContext {
  /** "api" | "browser" | "badge" | "cron" */
  source: string;
  /** API key name, or "anon" for browser/unauthenticated */
  apiKey: string;
  /** Cache status: "l1-hit" | "hit" | "stale" | "miss" */
  cacheStatus: string;
  /** Request processing time in ms */
  responseTimeMs: number;
  /** Cloudflare request metadata */
  cf?: {
    country?: string;
    continent?: string;
    colo?: string;
  };
  /** User-Agent header */
  userAgent: string | null;
}

/**
 * Send analytics event to the Pipeline (→ R2 Iceberg table).
 * Called on EVERY request (including cache hits) for demand analytics.
 */
export function sendCheckEvent(
  env: Env,
  result: ScoringResult,
  ctx: CheckEventContext,
): void {
  const [, owner, repo] = result.project.split('/');
  const project = `${owner}/${repo}`.toLowerCase();

  try {
    env.ISITALIVE_CHECKS_STREAM.send([{
      repo: project,
      provider: result.project.split('/')[0] ?? '',
      score: result.score,
      verdict: result.verdict,
      source: ctx.source,
      api_key: ctx.apiKey,
      country: ctx.cf?.country ?? 'XX',
      continent: ctx.cf?.continent ?? 'XX',
      colo: ctx.cf?.colo ?? 'XX',
      cache_status: ctx.cacheStatus,
      client_type: classifyUserAgent(ctx.userAgent),
      response_time_ms: ctx.responseTimeMs,
    }]);
  } catch {
    // Pipeline write failures must never break the request
  }
}

/**
 * Archive the raw GitHub API response to R2.
 * Called only on FRESH FETCHES (not cache hits).
 */
export async function archiveRawData(
  env: Env,
  provider: string,
  owner: string,
  repo: string,
  rawResponse: any,
): Promise<void> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const key = `raw/${provider}/${owner.toLowerCase()}/${repo.toLowerCase()}/${timestamp}.json`;

  try {
    await env.RAW_DATA.put(key, JSON.stringify(rawResponse), {
      httpMetadata: { contentType: 'application/json' },
    });
  } catch {
    // R2 write failures must never break the request
  }
}
