// ---------------------------------------------------------------------------
// Pipeline Emit — typed functions to send events to Cloudflare Pipelines
//
// Each function sends to the corresponding Pipeline binding.
// All sends are fire-and-forget (use with waitUntil).
//
// Events are flattened before sending: envelope fields (domain, timestamp, id)
// are merged with data fields into a single flat object to match the Iceberg
// schema defined in schemas/*.json.
// ---------------------------------------------------------------------------

import type { ProviderEvent } from '../events/provider'
import type { ResultEvent } from '../events/result'
import type { UsageEvent } from '../events/usage'
import type { ManifestEvent } from '../events/manifest'
import type { PipelineBindings } from './types'

type ProviderStreamRecord = Parameters<PipelineBindings['PROVIDER_PIPELINE']['send']>[0][number]
type ResultStreamRecord = Parameters<PipelineBindings['RESULT_PIPELINE']['send']>[0][number]
type UsageStreamRecord = Parameters<PipelineBindings['USAGE_PIPELINE']['send']>[0][number]
type ManifestStreamRecord = Parameters<PipelineBindings['MANIFEST_PIPELINE']['send']>[0][number]

function nullsToUndefined<T extends Record<string, unknown>>(record: T): T {
  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => [key, value === null ? undefined : value]),
  ) as T
}

/**
 * Flatten an event envelope into a single-level object for Iceberg.
 * Merges { domain, timestamp, id, data: { ... } } → { domain, type, timestamp, id, ... }
 *
 * NOTE: `type` is kept for backward compatibility — usage_events and
 * manifest_events streams still require it. V2 streams ignore extra fields.
 */
function flattenProvider(event: ProviderEvent): ProviderStreamRecord {
  const { data, ...envelope } = event
  return nullsToUndefined({ ...envelope, ...data }) as ProviderStreamRecord
}

function flattenResult(event: ResultEvent): ResultStreamRecord {
  const { data, ...envelope } = event
  return nullsToUndefined({ ...envelope, ...data }) as ResultStreamRecord
}

function flattenUsage(event: UsageEvent): UsageStreamRecord {
  const { data, ...envelope } = event
  return nullsToUndefined({ ...envelope, type: event.domain, ...data }) as UsageStreamRecord
}

function flattenManifest(event: ManifestEvent): ManifestStreamRecord {
  const { data, ...envelope } = event
  return nullsToUndefined({ ...envelope, type: event.domain, ...data }) as ManifestStreamRecord
}

const PIPELINE_SEND_TIMEOUT_MS = 2000
const PIPELINE_RETRY_DELAYS_MS = [250, 500]

/** Fire-and-forget send with per-attempt timeout + bounded retry. Errors are absorbed. */
export async function sendWithRetry(
  send: () => Promise<void>,
  label: string,
): Promise<void> {
  for (let attempt = 0; attempt <= PIPELINE_RETRY_DELAYS_MS.length; attempt++) {
    try {
      await Promise.race([
        send(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('pipeline send timed out')), PIPELINE_SEND_TIMEOUT_MS),
        ),
      ])
      return
    } catch (err) {
      if (attempt === PIPELINE_RETRY_DELAYS_MS.length) {
        console.error(JSON.stringify({
          level: 'error',
          msg: 'pipeline_send_failed',
          pipeline: label,
          error: err instanceof Error ? err.message : String(err),
        }))
        return
      }
      await new Promise((r) => setTimeout(r, PIPELINE_RETRY_DELAYS_MS[attempt]))
    }
  }
}

/**
 * Emit a provider event to the provider pipeline.
 * Call via `ctx.waitUntil(emitProviderEvent(env, event))`.
 */
export async function emitProviderEvent(
  env: PipelineBindings,
  event: ProviderEvent,
): Promise<void> {
  await sendWithRetry(() => env.PROVIDER_PIPELINE.send([flattenProvider(event)]), 'provider')
}

/**
 * Emit a result event to the result pipeline.
 */
export async function emitResultEvent(
  env: PipelineBindings,
  event: ResultEvent,
): Promise<void> {
  await sendWithRetry(() => env.RESULT_PIPELINE.send([flattenResult(event)]), 'result')
}

/**
 * Emit a usage event to the usage pipeline.
 */
export async function emitUsageEvent(
  env: PipelineBindings,
  event: UsageEvent,
): Promise<void> {
  await sendWithRetry(() => env.USAGE_PIPELINE.send([flattenUsage(event)]), 'usage')
}

/**
 * Emit a manifest event to the manifest pipeline.
 */
export async function emitManifestEvent(
  env: PipelineBindings,
  event: ManifestEvent,
): Promise<void> {
  await sendWithRetry(() => env.MANIFEST_PIPELINE.send([flattenManifest(event)]), 'manifest')
}

/**
 * Emit multiple events to their respective pipelines.
 * Convenience for route handlers that need to send to multiple pipelines.
 */
export async function emitAll(
  env: PipelineBindings,
  events: {
    provider?: ProviderEvent[]
    result?: ResultEvent[]
    usage?: UsageEvent[]
    manifest?: ManifestEvent[]
  },
): Promise<void> {
  const promises: Promise<void>[] = []

  for (const e of events.provider ?? []) promises.push(emitProviderEvent(env, e))
  for (const e of events.result ?? []) promises.push(emitResultEvent(env, e))
  for (const e of events.usage ?? []) promises.push(emitUsageEvent(env, e))
  for (const e of events.manifest ?? []) promises.push(emitManifestEvent(env, e))

  await Promise.allSettled(promises)
}
