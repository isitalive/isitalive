// ---------------------------------------------------------------------------
// Bounded concurrency helper — replaces "batch + await sleep" patterns that
// serialize work and waste request budget.
//
// Semantics mirror Promise.allSettled (one failure does not abort the rest),
// plus an optional cooperative stop — when `shouldStop()` is true the remaining
// items are not dispatched and come back as skipped placeholders so callers can
// mark them pending / to-be-completed-in-background.
// ---------------------------------------------------------------------------

export const SKIPPED = Symbol.for('isitalive.concurrency.skipped')

export type ConcurrencyResult<R> =
  | { status: 'fulfilled'; value: R }
  | { status: 'skipped' }
  | { status: 'rejected'; reason: unknown }

export interface ConcurrencyOptions {
  /** Maximum simultaneous workers. Must be >= 1. */
  limit: number
  /**
   * Optional cooperative stop — checked before each item is dispatched.
   * Returning true means "don't start any more work"; in-flight work is still
   * awaited so we don't leak promises.
   */
  shouldStop?: () => boolean
}

/**
 * Run `worker` over `items` with bounded concurrency. Preserves input order
 * in the result array and never throws — per-item errors land as
 * `{ status: 'rejected' }` entries.
 */
export async function runWithConcurrency<T, R>(
  items: readonly T[],
  worker: (item: T, index: number) => Promise<R>,
  opts: ConcurrencyOptions,
): Promise<ConcurrencyResult<R>[]> {
  if (opts.limit < 1) {
    throw new Error(`runWithConcurrency: limit must be >= 1, got ${opts.limit}`)
  }

  const results: ConcurrencyResult<R>[] = new Array(items.length)
  let nextIndex = 0

  const shouldStop = opts.shouldStop ?? (() => false)

  const runner = async (): Promise<void> => {
    while (true) {
      const i = nextIndex++
      if (i >= items.length) return

      if (shouldStop()) {
        results[i] = { status: 'skipped' }
        continue
      }

      try {
        const value = await worker(items[i], i)
        results[i] = { status: 'fulfilled', value }
      } catch (reason) {
        results[i] = { status: 'rejected', reason }
      }
    }
  }

  const workers: Promise<void>[] = []
  const concurrent = Math.min(opts.limit, items.length)
  for (let i = 0; i < concurrent; i++) {
    workers.push(runner())
  }
  await Promise.all(workers)

  // Invariant: every input item produced exactly one result entry.
  if (results.length !== items.length) {
    throw new Error(
      `runWithConcurrency: result length ${results.length} !== input length ${items.length}`,
    )
  }

  return results
}
