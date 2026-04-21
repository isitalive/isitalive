import { afterEach, describe, expect, it, vi } from 'vitest'
import * as circuit from './circuit'

function makeEnv() {
  const store = new Map<string, string>()
  return {
    CACHE_KV: {
      async get(key: string) { return store.get(key) ?? null },
      async put(key: string, value: string) { store.set(key, value) },
    },
  } as unknown as Cloudflare.Env
}

describe('circuit breaker', () => {
  afterEach(() => {
    circuit.__test__.reset('github')
    vi.useRealTimers()
  })

  it('stays closed under the threshold', async () => {
    const env = makeEnv()
    for (let i = 0; i < circuit.__test__.THRESHOLD - 1; i++) {
      await circuit.recordFailure(env, 'github')
    }
    expect(await circuit.isOpen(env, 'github')).toBe(false)
  })

  it('trips open after THRESHOLD failures within the window', async () => {
    const env = makeEnv()
    for (let i = 0; i < circuit.__test__.THRESHOLD; i++) {
      await circuit.recordFailure(env, 'github')
    }
    expect(await circuit.isOpen(env, 'github')).toBe(true)
  })

  it('auto-closes after OPEN_MS elapses', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-21T00:00:00.000Z'))
    const env = makeEnv()
    for (let i = 0; i < circuit.__test__.THRESHOLD; i++) {
      await circuit.recordFailure(env, 'github')
    }
    expect(await circuit.isOpen(env, 'github')).toBe(true)

    // Fast-forward past OPEN_MS
    vi.setSystemTime(new Date(Date.now() + circuit.__test__.OPEN_MS + 100))
    expect(await circuit.isOpen(env, 'github')).toBe(false)
  })

  it('resets on recordSuccess', async () => {
    const env = makeEnv()
    for (let i = 0; i < circuit.__test__.THRESHOLD; i++) {
      await circuit.recordFailure(env, 'github')
    }
    expect(await circuit.isOpen(env, 'github')).toBe(true)
    await circuit.recordSuccess(env, 'github')
    expect(await circuit.isOpen(env, 'github')).toBe(false)
  })

  it('resets failure count when the window has elapsed', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-21T00:00:00.000Z'))
    const env = makeEnv()

    await circuit.recordFailure(env, 'github')
    await circuit.recordFailure(env, 'github')

    // Advance past WINDOW_MS before a third failure — counter should reset.
    vi.setSystemTime(new Date(Date.now() + circuit.__test__.WINDOW_MS + 100))
    await circuit.recordFailure(env, 'github')

    // Only one failure since reset; should NOT be open.
    expect(await circuit.isOpen(env, 'github')).toBe(false)
  })
})
