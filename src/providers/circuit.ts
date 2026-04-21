// Circuit breaker for upstream providers. Per-isolate Map is the hot path;
// KV is only touched on state transitions (open↔close) and on the first
// call per isolate that observes a failure — steady-state success and
// steady-state closed-breaker both skip KV entirely.

import type { Env } from '../types/env'

const THRESHOLD = 3
const WINDOW_MS = 60_000
const OPEN_MS = 30_000
const KV_TTL_S = 300

interface BreakerState {
  failures: number
  windowStart: number
  trippedUntil: number
}

const memory = new Map<string, BreakerState>()
const hydrated = new Set<string>()

function kvKey(name: string): string {
  return `cb:${name}`
}

function emptyState(now: number): BreakerState {
  return { failures: 0, windowStart: now, trippedUntil: 0 }
}

async function loadState(env: Env, name: string): Promise<BreakerState> {
  const cached = memory.get(name)
  if (cached) return cached
  if (!hydrated.has(name)) {
    hydrated.add(name)
    try {
      const persisted = await env.CACHE_KV.get(kvKey(name), 'json') as BreakerState | null
      if (persisted) {
        memory.set(name, persisted)
        return persisted
      }
    } catch {
      // KV unavailable — fall through to a fresh state
    }
  }
  const state = emptyState(Date.now())
  memory.set(name, state)
  return state
}

async function persist(env: Env, name: string, state: BreakerState): Promise<void> {
  memory.set(name, state)
  try {
    await env.CACHE_KV.put(kvKey(name), JSON.stringify(state), { expirationTtl: KV_TTL_S })
  } catch {
    // best-effort; memory is authoritative for this isolate
  }
}

export async function isOpen(env: Env, name: string): Promise<boolean> {
  // Fast path: if we've already observed steady-state (closed, no failures)
  // in memory, skip the KV hydration — failures from other isolates will
  // surface as our own failures soon enough.
  const cached = memory.get(name)
  if (cached) return Date.now() < cached.trippedUntil
  const state = await loadState(env, name)
  return Date.now() < state.trippedUntil
}

export async function recordSuccess(env: Env, name: string): Promise<void> {
  const cached = memory.get(name)
  if (cached && cached.failures === 0 && cached.trippedUntil === 0) return
  const state = cached ?? await loadState(env, name)
  if (state.failures === 0 && state.trippedUntil === 0) return
  await persist(env, name, emptyState(Date.now()))
}

export async function recordFailure(env: Env, name: string): Promise<void> {
  const now = Date.now()
  const state = await loadState(env, name)

  if (now - state.windowStart > WINDOW_MS) {
    await persist(env, name, { failures: 1, windowStart: now, trippedUntil: 0 })
    return
  }

  const failures = state.failures + 1
  await persist(env, name, {
    failures,
    windowStart: state.windowStart,
    trippedUntil: failures >= THRESHOLD ? now + OPEN_MS : state.trippedUntil,
  })
}

// ---------------------------------------------------------------------------
// Test seams — exposed for unit tests so they don't need to wait for real
// time to pass. Not part of the public runtime API.
// ---------------------------------------------------------------------------

export const __test__ = {
  memory,
  THRESHOLD,
  WINDOW_MS,
  OPEN_MS,
  reset(name: string) { memory.delete(name); hydrated.delete(name) },
}
