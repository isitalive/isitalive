// ---------------------------------------------------------------------------
// Provider Events — raw data fetched from upstream APIs
//
// "What GitHub told us" — the raw API response for a repo.
// One event per fresh fetch (not cached). Stored in Iceberg for
// historical raw data analysis and replay.
// ---------------------------------------------------------------------------

import type { Event } from './envelope'
import { createEvent } from './envelope'
import type { ProviderName } from '../scoring/types'

/** Payload for a provider event */
export interface ProviderEventData {
  provider: ProviderName
  owner: string
  repo: string
  /** Stringified raw API response (kept as string for Iceberg storage) */
  raw_json: string
}

export type ProviderEvent = Event<'provider', ProviderEventData>

/** Build a provider event from a raw API response */
export function buildProviderEvent(
  provider: ProviderName,
  owner: string,
  repo: string,
  rawResponse: unknown,
): ProviderEvent {
  return createEvent('provider', {
    provider,
    owner: owner.toLowerCase(),
    repo: repo.toLowerCase(),
    raw_json: JSON.stringify(rawResponse),
  })
}
