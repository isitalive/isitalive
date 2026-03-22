// ---------------------------------------------------------------------------
// Usage Events — who/what/when/where accessed the service
//
// "Who asked" — tracks every API hit, page view, and badge request.
// High-cardinality: hashed IPs, API keys, geo data, client types.
// Powers trending, tracked repos, sitemap, and usage analytics.
// ---------------------------------------------------------------------------

import type { Event } from './envelope'
import { createEvent } from './envelope'
import { bufferToHex } from '../utils/crypto'

/** Payload for a usage event */
export interface UsageEventData {
  /** "owner/repo" or empty for non-repo requests */
  repo: string
  /** Provider name (e.g. "github") */
  provider: string
  /** Score at time of request (0 if unknown) */
  score: number
  /** Verdict at time of request */
  verdict: string
  /** Source: 'api' | 'browser' | 'badge' | 'page-view' | 'github-app' | 'audit' */
  source: string
  /** API key name hash, or 'anon', or 'oidc:{owner}/{repo}' */
  api_key: string
  /** Cache status: 'l1-hit' | 'hit' | 'stale' | 'miss' */
  cache_status: string
  /** ISO country code */
  country: string
  /** Classified user agent */
  user_agent: string
  /** Response time in ms */
  response_time_ms: number
  /** SHA-256 hashed IP for privacy-safe analytics */
  ip_hash: string
  /** OIDC source repository (e.g. "vercel/next.js"), null for API key auth */
  oidc_repository: string | null
  /** OIDC repository owner (e.g. "vercel"), null for API key auth */
  oidc_owner: string | null
}

export type UsageEvent = Event<'usage', UsageEventData>

/** Classify User-Agent into broad categories */
function classifyUserAgent(ua: string | null): string {
  if (!ua) return 'unknown'
  const lower = ua.toLowerCase()
  if (lower.includes('bot') || lower.includes('crawler') || lower.includes('spider')) return 'bot'
  if (lower.includes('curl') || lower.includes('wget') || lower.includes('httpie')) return 'cli'
  if (lower.includes('langchain') || lower.includes('openai') || lower.includes('anthropic') ||
      lower.includes('autogpt') || lower.includes('crewai')) return 'agent'
  if (lower.includes('mozilla') || lower.includes('chrome') || lower.includes('safari')) return 'browser'
  return 'other'
}

/** Hash an IP address for privacy-safe storage */
async function hashIp(ip: string | null): Promise<string> {
  if (!ip) return 'unknown'
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ip))
  return bufferToHex(buf).slice(0, 16)
}

/** Context passed from route handlers when building usage events */
export interface UsageContext {
  source: string
  apiKey: string
  cacheStatus: string
  responseTimeMs: number
  cf?: { country?: string }
  userAgent: string | null
  ip: string | null
  /** OIDC source repository (e.g. "vercel/next.js"), null for API key auth */
  oidcRepository?: string | null
  /** OIDC repository owner, null for API key auth */
  oidcOwner?: string | null
}

/** Build a usage event from request context */
export async function buildUsageEvent(
  repo: string,
  provider: string,
  score: number,
  verdict: string,
  ctx: UsageContext,
): Promise<UsageEvent> {
  return createEvent('usage', {
    repo: repo.toLowerCase(),
    provider,
    score,
    verdict,
    source: ctx.source,
    api_key: ctx.apiKey,
    cache_status: ctx.cacheStatus,
    country: ctx.cf?.country ?? 'XX',
    user_agent: classifyUserAgent(ctx.userAgent),
    response_time_ms: ctx.responseTimeMs,
    ip_hash: await hashIp(ctx.ip),
    oidc_repository: ctx.oidcRepository ?? null,
    oidc_owner: ctx.oidcOwner ?? null,
  })
}

/** Build a simple page-view usage event (browser beacon) */
export function buildPageViewUsageEvent(
  provider: string,
  owner: string,
  repo: string,
  score: number,
  verdict: string,
): UsageEvent {
  return createEvent('usage', {
    repo: `${owner}/${repo}`.toLowerCase(),
    provider,
    score,
    verdict,
    source: 'page-view',
    api_key: 'anon',
    cache_status: 'n/a',
    country: 'XX',
    user_agent: 'browser',
    response_time_ms: 0,
    ip_hash: 'unknown',
    oidc_repository: null,
    oidc_owner: null,
  })
}
