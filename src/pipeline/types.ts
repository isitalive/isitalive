// ---------------------------------------------------------------------------
// Event Queue Types — analytics event transport bindings and message shapes
// ---------------------------------------------------------------------------

import type { Env } from '../types/env'
import type { ProviderEvent } from '../events/provider'
import type { ResultEvent } from '../events/result'
import type { UsageEvent } from '../events/usage'
import type { ManifestEvent } from '../events/manifest'

export type QueuedAnalyticsEvent =
  | { domain: 'provider'; event: ProviderEvent }
  | { domain: 'result'; event: ResultEvent }
  | { domain: 'usage'; event: UsageEvent }
  | { domain: 'manifest'; event: ManifestEvent }

/** Queue binding subset of Env — for functions that only need event enqueue. */
export interface EventQueueBindings {
  EVENT_QUEUE: Env['EVENT_QUEUE']
}
