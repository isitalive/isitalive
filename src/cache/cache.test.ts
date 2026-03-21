import { describe, expect, it } from 'vitest'
import { cacheControlHeader, TIERS, type Tier } from './index'

// ── Tier config consistency ────────────────────────────────────────────
describe('tier config', () => {
  const tiers: Tier[] = ['free', 'pro', 'enterprise']

  it('freshTtl < staleTtl for all tiers', () => {
    for (const tier of tiers) {
      const config = TIERS[tier]
      expect(config.freshTtl).toBeLessThan(config.staleTtl)
    }
  })

  it('l1Ttl <= freshTtl for all tiers', () => {
    for (const tier of tiers) {
      const config = TIERS[tier]
      expect(config.l1Ttl).toBeLessThanOrEqual(config.freshTtl)
    }
  })

  it('all TTL values are positive', () => {
    for (const tier of tiers) {
      const config = TIERS[tier]
      expect(config.freshTtl).toBeGreaterThan(0)
      expect(config.staleTtl).toBeGreaterThan(0)
      expect(config.l1Ttl).toBeGreaterThan(0)
    }
  })

  it('higher tiers have shorter fresh TTLs', () => {
    expect(TIERS.enterprise.freshTtl).toBeLessThan(TIERS.pro.freshTtl)
    expect(TIERS.pro.freshTtl).toBeLessThan(TIERS.free.freshTtl)
  })
})

// ── cacheControlHeader ─────────────────────────────────────────────────
describe('cacheControlHeader', () => {
  it('returns correct header for free tier', () => {
    const header = cacheControlHeader('free')
    const free = TIERS.free
    const swr = free.staleTtl - free.freshTtl
    expect(header).toBe(
      `public, max-age=${free.l1Ttl}, s-maxage=${free.l1Ttl}, stale-while-revalidate=${swr}`,
    )
  })

  it('returns correct header for pro tier', () => {
    const header = cacheControlHeader('pro')
    const pro = TIERS.pro
    const swr = pro.staleTtl - pro.freshTtl
    expect(header).toBe(
      `public, max-age=${pro.l1Ttl}, s-maxage=${pro.l1Ttl}, stale-while-revalidate=${swr}`,
    )
  })

  it('returns correct header for enterprise tier', () => {
    const header = cacheControlHeader('enterprise')
    const ent = TIERS.enterprise
    const swr = ent.staleTtl - ent.freshTtl
    expect(header).toBe(
      `public, max-age=${ent.l1Ttl}, s-maxage=${ent.l1Ttl}, stale-while-revalidate=${swr}`,
    )
  })

  it('contains public directive for all tiers', () => {
    for (const tier of ['free', 'pro', 'enterprise'] as Tier[]) {
      expect(cacheControlHeader(tier)).toContain('public')
    }
  })

  it('stale-while-revalidate is > 0 for all tiers', () => {
    for (const tier of ['free', 'pro', 'enterprise'] as Tier[]) {
      const header = cacheControlHeader(tier)
      const match = header.match(/stale-while-revalidate=(\d+)/)
      expect(match).not.toBeNull()
      expect(parseInt(match![1])).toBeGreaterThan(0)
    }
  })
})
