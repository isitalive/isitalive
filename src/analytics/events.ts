// ---------------------------------------------------------------------------
// Analytics events — writes to R2 as JSON and archives raw GitHub responses
//
// Check events are batched by the queue consumer and written as JSON files
// to R2, creating an append-only analytics archive. Raw GitHub JSON is
// archived on fresh fetches only.
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

/** Structured analytics event for R2 storage */
export interface AnalyticsEvent {
  timestamp: string;
  repo: string;
  provider: string;
  score: number;
  verdict: string;
  source: string;
  api_key: string;
  country: string;
  continent: string;
  colo: string;
  cache_status: string;
  client_type: string;
  response_time_ms: number;
}

/**
 * Build a structured analytics event from a scoring result and context.
 */
export function buildAnalyticsEvent(result: ScoringResult, ctx: CheckEventContext): AnalyticsEvent {
  const [, owner, repo] = result.project.split('/');
  const project = `${owner}/${repo}`.toLowerCase();

  return {
    timestamp: new Date().toISOString(),
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
  };
}

/**
 * Write a batch of analytics events to R2 as a single JSON file.
 * Called by the queue consumer once per batch.
 */
export async function writeAnalyticsBatch(
  env: Env,
  events: AnalyticsEvent[],
): Promise<void> {
  if (events.length === 0) return;

  const now = new Date();
  const datePrefix = now.toISOString().slice(0, 10); // 2026-03-20
  const ts = now.toISOString().replace(/[:.]/g, '-');
  const key = `analytics/${datePrefix}/${ts}-${events.length}.json`;

  try {
    await env.RAW_DATA.put(key, JSON.stringify(events), {
      httpMetadata: { contentType: 'application/json' },
    });
  } catch (err) {
    console.error('Analytics: failed to write batch to R2:', err);
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
