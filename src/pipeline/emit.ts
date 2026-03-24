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
import type { Event, EventDomain } from '../events/envelope'
import type { PipelineBindings } from './types'

/**
 * Flatten an event envelope into a single-level object for Iceberg.
 * Merges { domain, timestamp, id, data: { ... } } → { domain, type, timestamp, id, ... }
 */
function flatten<T extends object>(event: { domain: string; timestamp: string; id: string; data: T }): Record<string, unknown> {
  const { data, ...envelope } = event
  return { ...envelope, ...data }
}

/**
 * Emit a provider event to the provider pipeline.
 * Call via `ctx.waitUntil(emitProviderEvent(env, event))`.
 */
export async function emitProviderEvent(
  env: PipelineBindings,
  event: ProviderEvent,
): Promise<void> {
  try {
    await env.PROVIDER_PIPELINE.send([flatten(event)])
  } catch (err) {
    console.error('Pipeline: failed to emit provider event:', err)
  }
}

/**
 * Emit a result event to the result pipeline.
 */
export async function emitResultEvent(
  env: PipelineBindings,
  event: ResultEvent,
): Promise<void> {
  try {
    await env.RESULT_PIPELINE.send([flatten(event)])
  } catch (err) {
    console.error('Pipeline: failed to emit result event:', err)
  }
}

/**
 * Emit a usage event to the usage pipeline.
 */
export async function emitUsageEvent(
  env: PipelineBindings,
  event: UsageEvent,
): Promise<void> {
  try {
    await env.USAGE_PIPELINE.send([flatten(event)])
  } catch (err) {
    console.error('Pipeline: failed to emit usage event:', err)
  }
}

/**
 * Emit a manifest event to the manifest pipeline.
 */
export async function emitManifestEvent(
  env: PipelineBindings,
  event: ManifestEvent,
): Promise<void> {
  try {
    await env.MANIFEST_PIPELINE.send([flatten(event)])
  } catch (err) {
    console.error('Pipeline: failed to emit manifest event:', err)
  }
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

