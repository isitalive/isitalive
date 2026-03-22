// ---------------------------------------------------------------------------
// Manifest Events — dependency scanning results
//
// "What they scanned" — captures manifest submissions from the /api/manifest
// endpoint and GitHub App PR checks. Links to result events via repo names
// and to usage events via timestamps.
// ---------------------------------------------------------------------------

import type { Event } from './envelope'
import { createEvent } from './envelope'

/** Payload for a manifest event */
export interface ManifestEventData {
  /** SHA-256 hash of the raw manifest content */
  manifest_hash: string
  /** Manifest format: 'go.mod' | 'package.json' */
  format: string
  /** Total number of dependencies in the manifest */
  dep_count: number
  /** Average health score across all scored dependencies */
  avg_score: number
  /** 'success' | 'failure' — based on score threshold */
  conclusion: string
  /** What triggered this scan: 'api' | 'pull_request' | 'push' | 'cron' */
  trigger: string
  /** GitHub App installation ID (0 for direct API calls) */
  installation_id: number
  /** Repository full name (for GitHub App events) or empty */
  repo: string
  /** PR number (for pull_request triggers, 0 otherwise) */
  pr_number: number
}

export type ManifestEvent = Event<'manifest', ManifestEventData>

/** Build a manifest event from an audit result */
export function buildManifestEvent(opts: {
  manifestHash: string
  format: string
  depCount: number
  avgScore: number
  conclusion: string
  trigger: string
  installationId?: number
  repo?: string
  prNumber?: number
}): ManifestEvent {
  return createEvent('manifest', {
    manifest_hash: opts.manifestHash,
    format: opts.format,
    dep_count: opts.depCount,
    avg_score: opts.avgScore,
    conclusion: opts.conclusion,
    trigger: opts.trigger,
    installation_id: opts.installationId ?? 0,
    repo: opts.repo?.toLowerCase() ?? '',
    pr_number: opts.prNumber ?? 0,
  })
}
