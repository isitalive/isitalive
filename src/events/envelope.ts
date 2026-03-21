// ---------------------------------------------------------------------------
// Event Envelope — base type for all events in the system
//
// Every event has a domain, timestamp, unique ID, and typed payload.
// Events are immutable facts written to Iceberg via Pipelines.
// ---------------------------------------------------------------------------

/** The 4 event domains */
export type EventDomain = 'provider' | 'result' | 'usage' | 'manifest'

/** Base envelope for all events emitted by the system */
export interface Event<D extends EventDomain, T> {
  /** Domain: 'provider' | 'result' | 'usage' | 'manifest' */
  domain: D
  /** ISO-8601 timestamp */
  timestamp: string
  /** Unique event ID (UUID v4) */
  id: string
  /** Event-specific payload */
  data: T
}

/** Create an event with auto-generated timestamp and ID */
export function createEvent<D extends EventDomain, T>(
  domain: D,
  data: T,
): Event<D, T> {
  return {
    domain,
    timestamp: new Date().toISOString(),
    id: crypto.randomUUID(),
    data,
  }
}
