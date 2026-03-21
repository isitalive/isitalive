// ---------------------------------------------------------------------------
// Events — barrel export
// ---------------------------------------------------------------------------

export type { EventDomain, Event } from './envelope'
export { createEvent } from './envelope'

export type { ProviderEventData, ProviderEvent } from './provider'
export { buildProviderEvent } from './provider'

export type { ResultEventData, ResultEvent } from './result'
export { buildResultEvent } from './result'

export type { UsageEventData, UsageEvent, UsageContext } from './usage'
export { buildUsageEvent, buildPageViewUsageEvent } from './usage'

export type { ManifestEventData, ManifestEvent } from './manifest'
export { buildManifestEvent } from './manifest'
