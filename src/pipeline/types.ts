// ---------------------------------------------------------------------------
// Pipeline Types — re-export Pipeline from scoring/types for convenience
//
// The Pipeline interface is defined in scoring/types.ts (alongside Env)
// to avoid circular imports. This module re-exports it and provides
// the PipelineBindings interface for functions that only need pipelines.
// ---------------------------------------------------------------------------

import type { Pipeline } from '../scoring/types'

export type { Pipeline }

/** Pipeline bindings subset of Env — for functions that only need pipelines */
export interface PipelineBindings {
  PROVIDER_PIPELINE: Pipeline
  RESULT_PIPELINE: Pipeline
  USAGE_PIPELINE: Pipeline
  MANIFEST_PIPELINE: Pipeline
}
