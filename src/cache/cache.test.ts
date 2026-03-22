import { describe, expect, it } from 'vitest'
import { cacheControlHeaders, TIERS, type Tier } from './index'

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

// ── cacheControlHeaders ────────────────────────────────────────────────
describe('cacheControlHeaders', () => {
  describe('anonymous (unauthenticated)', () => {
    it('returns CDN s-maxage=86400 for anonymous requests', () => {
      const headers = cacheControlHeaders('free', false)
      expect(headers['CDN-Cache-Control']).toBe('public, s-maxage=86400')
    })

    it('returns browser Cache-Control with tier TTL', () => {
      const headers = cacheControlHeaders('free', false)
      const free = TIERS.free
      const swr = free.staleTtl - free.freshTtl
      expect(headers['Cache-Control']).toBe(
        `public, max-age=${free.l1Ttl}, stale-while-revalidate=${swr}`,
      )
    })

    it('uses same CDN header for all tiers when anonymous', () => {
      for (const tier of ['free', 'pro', 'enterprise'] as Tier[]) {
        const headers = cacheControlHeaders(tier, false)
        expect(headers['CDN-Cache-Control']).toBe('public, s-maxage=86400')
      }
    })
  })

  describe('authenticated', () => {
    it('returns CDN private, no-store for authenticated requests', () => {
      const headers = cacheControlHeaders('pro', true)
      expect(headers['CDN-Cache-Control']).toBe('private, no-store')
    })

    it('returns browser Cache-Control private, no-store', () => {
      const headers = cacheControlHeaders('pro', true)
      expect(headers['Cache-Control']).toBe('private, no-store')
    })

    it('uses private CDN header for all tiers when authenticated', () => {
      for (const tier of ['free', 'pro', 'enterprise'] as Tier[]) {
        const headers = cacheControlHeaders(tier, true)
        expect(headers['CDN-Cache-Control']).toBe('private, no-store')
      }
    })
  })

  it('stale-while-revalidate is > 0 for all tiers', () => {
    for (const tier of ['free', 'pro', 'enterprise'] as Tier[]) {
      const headers = cacheControlHeaders(tier, false)
      const match = headers['Cache-Control'].match(/stale-while-revalidate=(\d+)/)
      expect(match).not.toBeNull()
      expect(parseInt(match![1])).toBeGreaterThan(0)
    }
  })
})
