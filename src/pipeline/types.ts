// ---------------------------------------------------------------------------
// Pipeline Types — derived from generated Worker bindings
//
// This module provides a small subset type for helpers that only need the
// pipeline bindings, while keeping the binding surface sourced from the
// generated Worker `Env`.
// ---------------------------------------------------------------------------

import type { Env, Pipeline } from '../types/env'

export type { Pipeline }

/** Pipeline bindings subset of Env — for functions that only need pipelines */
export interface PipelineBindings {
  PROVIDER_PIPELINE: Env['PROVIDER_PIPELINE']
  RESULT_PIPELINE: Env['RESULT_PIPELINE']
  USAGE_PIPELINE: Env['USAGE_PIPELINE']
  MANIFEST_PIPELINE: Env['MANIFEST_PIPELINE']
}
