// ---------------------------------------------------------------------------
// Event Emit — enqueue analytics events for D1 + R2 archive consumption
//
// The public helper names stay stable so route handlers do not care whether
// events travel through Pipelines or Queues.
// ---------------------------------------------------------------------------

import type { ProviderEvent } from '../events/provider'
import type { ResultEvent } from '../events/result'
import type { UsageEvent } from '../events/usage'
import type { ManifestEvent } from '../events/manifest'
import type { EventQueueBindings, QueuedAnalyticsEvent } from './types'

const QUEUE_SEND_TIMEOUT_MS = 2000
const QUEUE_RETRY_DELAYS_MS = [250, 500]

class QueueTimeoutError extends Error {
  constructor() { super('queue send timed out') }
}

/** Fire-and-forget enqueue with per-attempt timeout + bounded retry. Errors are absorbed. */
export async function sendWithRetry(
  send: () => Promise<void>,
  label: string,
): Promise<void> {
  for (let attempt = 0; attempt <= QUEUE_RETRY_DELAYS_MS.length; attempt++) {
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      await Promise.race([
        send(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new QueueTimeoutError()), QUEUE_SEND_TIMEOUT_MS)
        }),
      ])
      if (timer) clearTimeout(timer)
      return
    } catch (err) {
      if (timer) clearTimeout(timer)
      const isTimeout = err instanceof QueueTimeoutError
      const isTerminal = isTimeout || attempt === QUEUE_RETRY_DELAYS_MS.length
      if (isTerminal) {
        console.error(JSON.stringify({
          level: 'error',
          msg: 'event_enqueue_failed',
          queue: label,
          reason: isTimeout ? 'timeout' : 'error',
          error: err instanceof Error ? err.message : String(err),
        }))
        return
      }
      await new Promise((resolve) => setTimeout(resolve, QUEUE_RETRY_DELAYS_MS[attempt]))
    }
  }
}

function message(body: QueuedAnalyticsEvent): MessageSendRequest<QueuedAnalyticsEvent> {
  return { body, contentType: 'json' }
}

export async function emitProviderEvent(
  env: EventQueueBindings,
  event: ProviderEvent,
): Promise<void> {
  await sendWithRetry(
    () => env.EVENT_QUEUE.send({ domain: 'provider', event }, { contentType: 'json' }),
    'analytics',
  )
}

export async function emitResultEvent(
  env: EventQueueBindings,
  event: ResultEvent,
): Promise<void> {
  await sendWithRetry(
    () => env.EVENT_QUEUE.send({ domain: 'result', event }, { contentType: 'json' }),
    'analytics',
  )
}

export async function emitUsageEvent(
  env: EventQueueBindings,
  event: UsageEvent,
): Promise<void> {
  await sendWithRetry(
    () => env.EVENT_QUEUE.send({ domain: 'usage', event }, { contentType: 'json' }),
    'analytics',
  )
}

export async function emitManifestEvent(
  env: EventQueueBindings,
  event: ManifestEvent,
): Promise<void> {
  await sendWithRetry(
    () => env.EVENT_QUEUE.send({ domain: 'manifest', event }, { contentType: 'json' }),
    'analytics',
  )
}

/**
 * Emit multiple events to the analytics queue.
 * Convenience for route handlers that need to send multiple domains together.
 */
export async function emitAll(
  env: EventQueueBindings,
  events: {
    provider?: ProviderEvent[]
    result?: ResultEvent[]
    usage?: UsageEvent[]
    manifest?: ManifestEvent[]
  },
): Promise<void> {
  const messages: MessageSendRequest<QueuedAnalyticsEvent>[] = [
    ...(events.provider ?? []).map((event) => message({ domain: 'provider', event })),
    ...(events.result ?? []).map((event) => message({ domain: 'result', event })),
    ...(events.usage ?? []).map((event) => message({ domain: 'usage', event })),
    ...(events.manifest ?? []).map((event) => message({ domain: 'manifest', event })),
  ]

  if (messages.length === 0) return
  await sendWithRetry(() => env.EVENT_QUEUE.sendBatch(messages), 'analytics')
}
