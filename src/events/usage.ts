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
  /** API key display name or non-secret identifier (e.g. 'anon', or 'oidc:{owner}/{repo}') */
  api_key: string
  /** Cache status: 'l1-hit' | 'l2-hit' | 'l2-stale' | 'l3-miss' */
  cache_status: string
  /** ISO country code */
  country: string
  /** Classified user agent */
  user_agent: string
  /** Normalized client family: agent | ci | cli | browser | bot | api | unknown */
  client_family: string
  /** Normalized client name such as codex, claude-code, cursor, curl, browser, unknown */
  client_name: string
  /** Sanitized client version, empty when absent */
  client_version: string
  /** Attribution source: header | user-agent | auth | default */
  client_source: string
  /** Stable display/grouping label derived from normalized fields */
  client_label: string
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

export interface ClientAttribution {
  family: 'agent' | 'ci' | 'cli' | 'browser' | 'bot' | 'api' | 'unknown'
  name: string
  version: string
  source: 'header' | 'user-agent' | 'auth' | 'default'
  label: string
}

const UNKNOWN_CLIENT: ClientAttribution = {
  family: 'unknown',
  name: 'unknown',
  version: '',
  source: 'default',
  label: 'unknown',
}

const CLIENT_HEADER_MAX_LENGTH = 128

/** Classify User-Agent into broad categories */
function classifyUserAgent(ua: string | null): string {
  if (!ua) return 'unknown'
  const lower = ua.toLowerCase()
  if (lower.includes('bot') || lower.includes('crawler') || lower.includes('spider')) return 'bot'
  if (lower.includes('curl') || lower.includes('wget') || lower.includes('httpie')) return 'cli'
  if (lower.includes('langchain') || lower.includes('openai') || lower.includes('anthropic') ||
      lower.includes('autogpt') || lower.includes('crewai') || lower.includes('codex') ||
      lower.includes('claude-code') || lower.includes('cursor')) return 'agent'
  if (lower.includes('mozilla') || lower.includes('chrome') || lower.includes('safari')) return 'browser'
  return 'other'
}

function clientLabel(name: string, version: string): string {
  return version ? `${name}/${version}` : name
}

function normalizeClientName(value: string): string | null {
  const normalized = value.trim().toLowerCase()
    .replace(/[_\s]+/g, '-')
    .replace(/[^a-z0-9.-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')

  if (!normalized || normalized.length > 64) return null
  return normalized
}

function normalizeClientVersion(value: string | undefined): string {
  if (!value) return ''
  return value.trim()
    .replace(/[^a-zA-Z0-9._+:-]/g, '')
    .slice(0, 32)
}

function knownClientFamily(name: string): ClientAttribution['family'] {
  if (['codex', 'chatgpt', 'claude-code', 'anthropic', 'cursor', 'copilot', 'aider', 'cline', 'continue', 'langchain', 'crewai', 'autogpt'].includes(name)) {
    return 'agent'
  }
  if (['github-actions', 'github-action', 'isitalive-audit-action'].includes(name)) return 'ci'
  if (['curl', 'wget', 'httpie', 'node-fetch', 'undici', 'python-requests', 'go-http-client'].includes(name)) return 'cli'
  return 'api'
}

function parseClientHeader(header: string | null): ClientAttribution | null {
  if (!header) return null
  const trimmed = header.trim()
  if (!trimmed || trimmed.length > CLIENT_HEADER_MAX_LENGTH || /[\r\n]/.test(trimmed)) {
    return UNKNOWN_CLIENT
  }

  const match = trimmed.match(/^([A-Za-z0-9][A-Za-z0-9._ -]{0,63})(?:\/([A-Za-z0-9][A-Za-z0-9._+:-]{0,31}))?(?:\s+\([^)]{1,96}\))?$/)
  if (!match) return UNKNOWN_CLIENT

  const name = normalizeClientName(match[1])
  if (!name) return UNKNOWN_CLIENT
  const version = normalizeClientVersion(match[2])
  return {
    family: knownClientFamily(name),
    name,
    version,
    source: 'header',
    label: clientLabel(name, version),
  }
}

function parseUserAgentClient(ua: string | null): ClientAttribution | null {
  if (!ua) return null
  const lower = ua.toLowerCase()

  const known: Array<{ pattern: RegExp; family: ClientAttribution['family']; name: string }> = [
    { pattern: /\bcodex\b/, family: 'agent', name: 'codex' },
    { pattern: /\bclaude-code\b|\banthropic\b/, family: 'agent', name: lower.includes('claude-code') ? 'claude-code' : 'anthropic' },
    { pattern: /\bcursor\b/, family: 'agent', name: 'cursor' },
    { pattern: /\bgithub-actions\b|\bisitalive\/audit-action\b/, family: 'ci', name: 'github-actions' },
    { pattern: /\blangchain\b/, family: 'agent', name: 'langchain' },
    { pattern: /\bcrewai\b/, family: 'agent', name: 'crewai' },
    { pattern: /\bautogpt\b/, family: 'agent', name: 'autogpt' },
    { pattern: /\bcurl\b/, family: 'cli', name: 'curl' },
    { pattern: /\bwget\b/, family: 'cli', name: 'wget' },
    { pattern: /\bhttpie\b/, family: 'cli', name: 'httpie' },
    { pattern: /\bnode-fetch\b/, family: 'cli', name: 'node-fetch' },
    { pattern: /\bundici\b/, family: 'cli', name: 'undici' },
    { pattern: /\bpython-requests\b/, family: 'cli', name: 'python-requests' },
    { pattern: /\bgo-http-client\b/, family: 'cli', name: 'go-http-client' },
  ]

  for (const client of known) {
    if (client.pattern.test(lower)) {
      const version = normalizeClientVersion(ua.match(new RegExp(`${client.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\/([^\\s;)]+)`, 'i'))?.[1])
      return {
        family: client.family,
        name: client.name,
        version,
        source: 'user-agent',
        label: clientLabel(client.name, version),
      }
    }
  }

  if (lower.includes('bot') || lower.includes('crawler') || lower.includes('spider')) {
    return { family: 'bot', name: 'bot', version: '', source: 'user-agent', label: 'bot' }
  }

  if (lower.includes('mozilla') || lower.includes('chrome') || lower.includes('safari')) {
    return { family: 'browser', name: 'browser', version: '', source: 'user-agent', label: 'browser' }
  }

  return null
}

export function classifyClient(ctx: Pick<UsageContext, 'clientHeader' | 'userAgent' | 'source' | 'oidcRepository'>): ClientAttribution {
  const headerClient = parseClientHeader(ctx.clientHeader ?? null)
  if (headerClient) return headerClient

  const uaClient = parseUserAgentClient(ctx.userAgent ?? null)
  if (uaClient?.family === 'agent' || uaClient?.family === 'ci') return uaClient

  if (ctx.oidcRepository) {
    return {
      family: 'ci',
      name: 'github-actions',
      version: '',
      source: 'auth',
      label: 'github-actions',
    }
  }

  if (uaClient) return uaClient

  if (ctx.source === 'api' || ctx.source === 'audit') {
    return { ...UNKNOWN_CLIENT, family: 'api' }
  }

  return UNKNOWN_CLIENT
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
  clientHeader?: string | null
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
  const client = classifyClient(ctx)
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
    client_family: client.family,
    client_name: client.name,
    client_version: client.version,
    client_source: client.source,
    client_label: client.label,
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
    client_family: 'browser',
    client_name: 'browser',
    client_version: '',
    client_source: 'default',
    client_label: 'browser',
    response_time_ms: 0,
    ip_hash: 'unknown',
    oidc_repository: null,
    oidc_owner: null,
  })
}
