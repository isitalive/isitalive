// ---------------------------------------------------------------------------
// Tests for runWithConcurrency — bounded parallelism, ordering, shouldStop.
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest'
import { runWithConcurrency } from './concurrency'

function defer<T>(): { promise: Promise<T>; resolve: (v: T) => void; reject: (e: unknown) => void } {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

describe('runWithConcurrency', () => {
  it('returns [] for empty input', async () => {
    const results = await runWithConcurrency([], async (x) => x, { limit: 4 })
    expect(results).toEqual([])
  })

  it('preserves input-to-result ordering', async () => {
    const items = [10, 20, 30, 40, 50]
    const results = await runWithConcurrency(
      items,
      async (n, i) => ({ n, i }),
      { limit: 2 },
    )
    expect(results).toHaveLength(items.length)
    results.forEach((r, i) => {
      expect(r.status).toBe('fulfilled')
      if (r.status === 'fulfilled') {
        expect(r.value).toEqual({ n: items[i], i })
      }
    })
  })

  it('never exceeds the configured concurrency limit', async () => {
    const limit = 3
    let active = 0
    let maxActive = 0

    await runWithConcurrency(
      Array.from({ length: 12 }, (_, i) => i),
      async () => {
        active++
        maxActive = Math.max(maxActive, active)
        await new Promise((r) => setTimeout(r, 5))
        active--
      },
      { limit },
    )

    expect(maxActive).toBeLessThanOrEqual(limit)
    expect(maxActive).toBe(limit)
  })

  it('records per-item rejections without aborting the run', async () => {
    const results = await runWithConcurrency(
      [1, 2, 3, 4],
      async (n) => {
        if (n % 2 === 0) throw new Error(`bad ${n}`)
        return n
      },
      { limit: 2 },
    )

    expect(results).toHaveLength(4)
    expect(results[0]).toEqual({ status: 'fulfilled', value: 1 })
    expect(results[1].status).toBe('rejected')
    expect(results[2]).toEqual({ status: 'fulfilled', value: 3 })
    expect(results[3].status).toBe('rejected')
  })

  it('marks remaining items as skipped when shouldStop flips true', async () => {
    let processed = 0

    const results = await runWithConcurrency(
      [1, 2, 3, 4, 5, 6, 7, 8],
      async (n) => {
        processed++
        return n
      },
      {
        limit: 1,
        shouldStop: () => processed >= 3,
      },
    )

    const fulfilled = results.filter((r) => r.status === 'fulfilled')
    const skipped = results.filter((r) => r.status === 'skipped')
    expect(fulfilled.length).toBe(3)
    expect(skipped.length).toBe(5)
    // Fulfilled entries must remain at the original positions of those items.
    expect(results[0].status).toBe('fulfilled')
    expect(results[7].status).toBe('skipped')
  })

  it('awaits in-flight workers even after shouldStop turns on', async () => {
    const d = defer<number>()
    let stopped = false

    const promise = runWithConcurrency(
      [1, 2, 3, 4],
      async (n) => {
        if (n === 1) return d.promise
        stopped = true
        return n * 10
      },
      {
        limit: 2,
        shouldStop: () => stopped,
      },
    )

    // Let items 1 and 2 dispatch; item 2 flips shouldStop.
    await new Promise((r) => setTimeout(r, 1))
    d.resolve(999)

    const results = await promise
    expect(results[0]).toEqual({ status: 'fulfilled', value: 999 })
    expect(results[1]).toEqual({ status: 'fulfilled', value: 20 })
    // items 3, 4 should be skipped
    expect(results[2].status).toBe('skipped')
    expect(results[3].status).toBe('skipped')
  })

  it('throws when limit < 1', async () => {
    await expect(
      runWithConcurrency([1], async (x) => x, { limit: 0 }),
    ).rejects.toThrow(/limit must be >= 1/)
  })
})
