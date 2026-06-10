// ---------------------------------------------------------------------------
// Queue consumer — archive analytics events to R2 JSONL, then persist D1 rows
// ---------------------------------------------------------------------------

import type { Env } from '../types/env'
import type { ProviderEvent } from '../events/provider'
import type { ResultEvent } from '../events/result'
import type { UsageEvent } from '../events/usage'
import type { ManifestEvent } from '../events/manifest'
import type { QueuedAnalyticsEvent } from '../pipeline/types'

type EventDomain = QueuedAnalyticsEvent['domain']
type AnalyticsEvent = ProviderEvent | ResultEvent | UsageEvent | ManifestEvent

interface EventGroup {
  domain: EventDomain
  dt: string
  hour: string
  events: AnalyticsEvent[]
}

const HOT_RETENTION_DAYS = 30

function isQueuedAnalyticsEvent(value: unknown): value is QueuedAnalyticsEvent {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<QueuedAnalyticsEvent>
  return (
    (candidate.domain === 'usage' ||
      candidate.domain === 'result' ||
      candidate.domain === 'provider' ||
      candidate.domain === 'manifest') &&
    !!candidate.event &&
    typeof candidate.event === 'object'
  )
}

function partition(timestamp: string): { dt: string; hour: string } {
  const fallback = new Date().toISOString()
  const normalized = Number.isNaN(new Date(timestamp).getTime()) ? fallback : timestamp
  return {
    dt: normalized.slice(0, 10),
    hour: normalized.slice(11, 13) || '00',
  }
}

function groupMessages(messages: readonly Message<QueuedAnalyticsEvent>[]): EventGroup[] {
  const groups = new Map<string, EventGroup>()

  for (const message of messages) {
    if (!isQueuedAnalyticsEvent(message.body)) {
      console.warn(JSON.stringify({ level: 'warn', msg: 'analytics_queue_invalid_message' }))
      continue
    }

    const { domain, event } = message.body
    const { dt, hour } = partition(event.timestamp)
    const key = `${domain}:${dt}:${hour}`
    const group = groups.get(key) ?? { domain, dt, hour, events: [] }
    group.events.push(event as AnalyticsEvent)
    groups.set(key, group)
  }

  return [...groups.values()]
}

function minTimestamp(events: AnalyticsEvent[]): string {
  return events.reduce((min, event) => event.timestamp < min ? event.timestamp : min, events[0].timestamp)
}

function maxTimestamp(events: AnalyticsEvent[]): string {
  return events.reduce((max, event) => event.timestamp > max ? event.timestamp : max, events[0].timestamp)
}

function archiveKey(group: EventGroup, batchId: string): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  return `events/raw/type=${group.domain}/dt=${group.dt}/hour=${group.hour}/${stamp}-${batchId}.jsonl`
}

async function archiveGroup(env: Env, group: EventGroup, batchId: string): Promise<string> {
  const key = archiveKey(group, batchId)
  const body = group.events.map((event) => JSON.stringify(event)).join('\n') + '\n'
  await env.DATA_BUCKET.put(key, body, {
    httpMetadata: { contentType: 'application/x-ndjson' },
    customMetadata: {
      domain: group.domain,
      eventCount: String(group.events.length),
      oldestTimestamp: minTimestamp(group.events),
      newestTimestamp: maxTimestamp(group.events),
    },
  })
  return key
}

function ingestMarker(db: D1Database, event: AnalyticsEvent, domain: EventDomain, archivedAt: string): D1PreparedStatement {
  return db
    .prepare(`
      INSERT OR IGNORE INTO event_ingest (event_id, event_domain, archived_at)
      VALUES (?, ?, ?)
    `)
    .bind(event.id, domain, archivedAt)
}

function updateIngestMarker(db: D1Database, event: AnalyticsEvent, aggregatedAt: string): D1PreparedStatement {
  return db
    .prepare(`
      UPDATE event_ingest
      SET aggregated_at = ?
      WHERE event_id = ?
        AND changes() > 0
    `)
    .bind(aggregatedAt, event.id)
}

function archiveBatchStatement(
  db: D1Database,
  group: EventGroup,
  batchId: string,
  r2Key: string,
  archivedAt: string,
): D1PreparedStatement {
  return db
    .prepare(`
      INSERT INTO archive_batches (
        batch_id, event_domain, r2_key, event_count, oldest_timestamp, newest_timestamp, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `)
    .bind(
      batchId,
      group.domain,
      r2Key,
      group.events.length,
      minTimestamp(group.events),
      maxTimestamp(group.events),
      archivedAt,
    )
}

function stringOrDefault(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback
}

function usageStatements(db: D1Database, event: UsageEvent, archivedAt: string): D1PreparedStatement[] {
  const data = event.data
  const day = event.timestamp.slice(0, 10)
  const clientFamily = stringOrDefault(data.client_family, 'unknown')
  const clientName = stringOrDefault(data.client_name, 'unknown')
  const clientVersion = stringOrDefault(data.client_version, '')
  const clientSource = stringOrDefault(data.client_source, 'default')
  const clientLabel = stringOrDefault(data.client_label, clientName)
  const statements = [
    ingestMarker(db, event, 'usage', archivedAt),
    db
      .prepare(`
        INSERT INTO usage_events (
          id, timestamp, repo, provider, score, verdict, source, api_key, cache_status,
          country, user_agent, client_family, client_name, client_version, client_source,
          client_label, response_time_ms, ip_hash, oidc_repository, oidc_owner, data_json
        )
        SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
        WHERE changes() = 1
      `)
      .bind(
        event.id,
        event.timestamp,
        data.repo,
        data.provider,
        data.score,
        data.verdict,
        data.source,
        data.api_key,
        data.cache_status,
        data.country,
        data.user_agent,
        clientFamily,
        clientName,
        clientVersion,
        clientSource,
        clientLabel,
        data.response_time_ms,
        data.ip_hash,
        data.oidc_repository,
        data.oidc_owner,
        JSON.stringify(event),
      ),
    db
      .prepare(`
        INSERT INTO daily_usage_repo (
          day, repo, provider, source, checks, latest_score, latest_verdict, last_seen
        )
        SELECT ?, ?, ?, ?, 1, ?, ?, ?
        WHERE changes() = 1
        ON CONFLICT(day, repo, source) DO UPDATE SET
          checks = daily_usage_repo.checks + 1,
          latest_score = CASE
            WHEN excluded.last_seen >= daily_usage_repo.last_seen THEN excluded.latest_score
            ELSE daily_usage_repo.latest_score
          END,
          latest_verdict = CASE
            WHEN excluded.last_seen >= daily_usage_repo.last_seen THEN excluded.latest_verdict
            ELSE daily_usage_repo.latest_verdict
          END,
          last_seen = MAX(daily_usage_repo.last_seen, excluded.last_seen)
      `)
      .bind(day, data.repo, data.provider, data.source, data.score, data.verdict, event.timestamp),
    db
      .prepare(`
        INSERT INTO daily_client_usage (
          day, client_family, client_name, source, requests, repos_checked, avg_response_time_ms, last_seen
        )
        SELECT ?, ?, ?, ?, 1, ?, ?, ?
        WHERE changes() = 1
        ON CONFLICT(day, client_family, client_name, source) DO UPDATE SET
          requests = daily_client_usage.requests + excluded.requests,
          repos_checked = daily_client_usage.repos_checked + excluded.repos_checked,
          avg_response_time_ms = ROUND(
            ((daily_client_usage.avg_response_time_ms * daily_client_usage.requests) + excluded.avg_response_time_ms)
            / (daily_client_usage.requests + excluded.requests),
            1
          ),
          last_seen = MAX(daily_client_usage.last_seen, excluded.last_seen)
      `)
      .bind(
        day,
        clientFamily,
        clientName,
        data.source,
        data.repo ? 1 : 0,
        data.response_time_ms,
        event.timestamp,
      ),
  ]

  if (data.source === 'audit' && data.oidc_repository && data.cache_status !== 'l2-hit') {
    statements.push(
      db
        .prepare(`
          INSERT INTO monthly_oidc_usage (period, repository, owner, used, updated_at)
          SELECT ?, ?, ?, 1, ?
          WHERE changes() = 1
          ON CONFLICT(period, repository) DO UPDATE SET
            used = monthly_oidc_usage.used + 1,
            owner = excluded.owner,
            updated_at = excluded.updated_at
        `)
        .bind(event.timestamp.slice(0, 7), data.oidc_repository, data.oidc_owner, event.timestamp),
    )
  }

  statements.push(updateIngestMarker(db, event, archivedAt))
  return statements
}

function resultStatements(db: D1Database, event: ResultEvent, archivedAt: string): D1PreparedStatement[] {
  const data = event.data
  const day = event.timestamp.slice(0, 10)
  return [
    ingestMarker(db, event, 'result', archivedAt),
    db
      .prepare(`
        INSERT INTO result_events (id, timestamp, project, score, verdict, source, data_json)
        SELECT ?, ?, ?, ?, ?, ?, ?
        WHERE changes() = 1
      `)
      .bind(event.id, event.timestamp, data.project, data.score, data.verdict, data.source, JSON.stringify(event)),
    db
      .prepare(`
        INSERT INTO daily_result_scores (
          day, project, score_sum, score_count, latest_score, latest_verdict, last_seen
        )
        SELECT ?, ?, ?, 1, ?, ?, ?
        WHERE changes() = 1
        ON CONFLICT(day, project) DO UPDATE SET
          score_sum = daily_result_scores.score_sum + excluded.score_sum,
          score_count = daily_result_scores.score_count + 1,
          latest_score = CASE
            WHEN excluded.last_seen >= daily_result_scores.last_seen THEN excluded.latest_score
            ELSE daily_result_scores.latest_score
          END,
          latest_verdict = CASE
            WHEN excluded.last_seen >= daily_result_scores.last_seen THEN excluded.latest_verdict
            ELSE daily_result_scores.latest_verdict
          END,
          last_seen = MAX(daily_result_scores.last_seen, excluded.last_seen)
      `)
      .bind(day, data.project, data.score, data.score, data.verdict, event.timestamp),
    updateIngestMarker(db, event, archivedAt),
  ]
}

function providerStatements(db: D1Database, event: ProviderEvent, archivedAt: string): D1PreparedStatement[] {
  const data = event.data
  const day = event.timestamp.slice(0, 10)
  const project = `${data.owner}/${data.repo}`
  return [
    ingestMarker(db, event, 'provider', archivedAt),
    db
      .prepare(`
        INSERT INTO provider_events (
          id, timestamp, provider, owner, repo, archived, stars, forks, data_json
        )
        SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?
        WHERE changes() = 1
      `)
      .bind(
        event.id,
        event.timestamp,
        data.provider,
        data.owner,
        data.repo,
        data.archived ? 1 : 0,
        data.stars,
        data.forks,
        JSON.stringify(event),
      ),
    db
      .prepare(`
        INSERT INTO daily_provider_stats (
          day, provider, project, fetches, latest_archived, latest_stars, last_seen
        )
        SELECT ?, ?, ?, 1, ?, ?, ?
        WHERE changes() = 1
        ON CONFLICT(day, provider, project) DO UPDATE SET
          fetches = daily_provider_stats.fetches + 1,
          latest_archived = excluded.latest_archived,
          latest_stars = excluded.latest_stars,
          last_seen = MAX(daily_provider_stats.last_seen, excluded.last_seen)
      `)
      .bind(day, data.provider, project, data.archived ? 1 : 0, data.stars, event.timestamp),
    updateIngestMarker(db, event, archivedAt),
  ]
}

function manifestStatements(db: D1Database, event: ManifestEvent, archivedAt: string): D1PreparedStatement[] {
  const data = event.data
  const day = event.timestamp.slice(0, 10)
  return [
    ingestMarker(db, event, 'manifest', archivedAt),
    db
      .prepare(`
        INSERT INTO manifest_events (
          id, timestamp, manifest_hash, format, dep_count, avg_score, conclusion,
          trigger, installation_id, repo, pr_number, data_json
        )
        SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
        WHERE changes() = 1
      `)
      .bind(
        event.id,
        event.timestamp,
        data.manifest_hash,
        data.format,
        data.dep_count,
        data.avg_score,
        data.conclusion,
        data.trigger,
        data.installation_id,
        data.repo,
        data.pr_number,
        JSON.stringify(event),
      ),
    db
      .prepare(`
        INSERT INTO daily_manifest_stats (
          day, repo, trigger, scans, dep_count_sum, score_sum, score_count, last_seen
        )
        SELECT ?, ?, ?, 1, ?, ?, 1, ?
        WHERE changes() = 1
        ON CONFLICT(day, repo, trigger) DO UPDATE SET
          scans = daily_manifest_stats.scans + 1,
          dep_count_sum = daily_manifest_stats.dep_count_sum + excluded.dep_count_sum,
          score_sum = daily_manifest_stats.score_sum + excluded.score_sum,
          score_count = daily_manifest_stats.score_count + 1,
          last_seen = MAX(daily_manifest_stats.last_seen, excluded.last_seen)
      `)
      .bind(day, data.repo, data.trigger, data.dep_count, data.avg_score, event.timestamp),
    updateIngestMarker(db, event, archivedAt),
  ]
}

function eventStatements(db: D1Database, group: EventGroup, archivedAt: string): D1PreparedStatement[] {
  return group.events.flatMap((event) => {
    if (group.domain === 'usage') return usageStatements(db, event as UsageEvent, archivedAt)
    if (group.domain === 'result') return resultStatements(db, event as ResultEvent, archivedAt)
    if (group.domain === 'provider') return providerStatements(db, event as ProviderEvent, archivedAt)
    return manifestStatements(db, event as ManifestEvent, archivedAt)
  })
}

async function persistGroup(env: Env, group: EventGroup): Promise<void> {
  if (group.events.length === 0) return
  const batchId = crypto.randomUUID()
  const archivedAt = new Date().toISOString()
  const r2Key = await archiveGroup(env, group, batchId)

  await env.DB.batch([
    archiveBatchStatement(env.DB, group, batchId, r2Key, archivedAt),
    ...eventStatements(env.DB, group, archivedAt),
  ])
}

export async function handleEventQueue(
  batch: MessageBatch<QueuedAnalyticsEvent>,
  env: Env,
): Promise<void> {
  const groups = groupMessages(batch.messages)
  for (const group of groups) {
    await persistGroup(env, group)
  }
}

export async function pruneArchivedHotEvents(env: Env, retentionDays = HOT_RETENTION_DAYS): Promise<void> {
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString()
  const tables: Array<{ domain: EventDomain; table: string }> = [
    { domain: 'usage', table: 'usage_events' },
    { domain: 'result', table: 'result_events' },
    { domain: 'provider', table: 'provider_events' },
    { domain: 'manifest', table: 'manifest_events' },
  ]

  await env.DB.batch(
    tables.map(({ domain, table }) => env.DB
      .prepare(`
        DELETE FROM ${table}
        WHERE timestamp < ?
          AND timestamp <= COALESCE((
            SELECT MAX(newest_timestamp)
            FROM archive_batches
            WHERE event_domain = ?
          ), '')
      `)
      .bind(cutoff, domain)),
  )
}
