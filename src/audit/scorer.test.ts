import { describe, expect, it } from 'vitest'
import { buildSummary, hashManifest, type AuditDep } from './scorer'

function makeDep(overrides: Partial<AuditDep> = {}): AuditDep {
  return {
    name: 'test-pkg',
    version: '1.0.0',
    dev: false,
    ecosystem: 'npm',
    github: 'owner/repo',
    score: 80,
    verdict: 'healthy',
    ...overrides,
  }
}

// ── buildSummary ───────────────────────────────────────────────────────
describe('buildSummary', () => {
  it('counts verdicts correctly', () => {
    const deps = [
      makeDep({ verdict: 'healthy', score: 90 }),
      makeDep({ verdict: 'healthy', score: 85 }),
      makeDep({ verdict: 'stable', score: 65 }),
      makeDep({ verdict: 'degraded', score: 45 }),
      makeDep({ verdict: 'critical', score: 25 }),
      makeDep({ verdict: 'unmaintained', score: 10 }),
    ]
    const summary = buildSummary(deps)
    expect(summary.healthy).toBe(2)
    expect(summary.stable).toBe(1)
    expect(summary.degraded).toBe(1)
    expect(summary.critical).toBe(1)
    expect(summary.unmaintained).toBe(1)
  })

  it('computes avgScore correctly', () => {
    const deps = [
      makeDep({ score: 90 }),
      makeDep({ score: 70 }),
      makeDep({ score: 50 }),
    ]
    const summary = buildSummary(deps)
    expect(summary.avgScore).toBe(70) // (90 + 70 + 50) / 3 = 70
  })

  it('rounds avgScore to integer', () => {
    const deps = [
      makeDep({ score: 33 }),
      makeDep({ score: 33 }),
      makeDep({ score: 34 }),
    ]
    const summary = buildSummary(deps)
    expect(Number.isInteger(summary.avgScore)).toBe(true)
  })

  it('returns 0 avgScore for empty array', () => {
    const summary = buildSummary([])
    expect(summary.avgScore).toBe(0)
    expect(summary.healthy).toBe(0)
    expect(summary.stable).toBe(0)
  })

  it('treats null scores as 0 in average', () => {
    const deps = [
      makeDep({ score: 100 }),
      makeDep({ score: null, verdict: 'unresolved' }),
    ]
    const summary = buildSummary(deps)
    expect(summary.avgScore).toBe(50) // (100 + 0) / 2
  })

  it('ignores unknown verdict values in counts', () => {
    const deps = [
      makeDep({ verdict: 'pending' }),
      makeDep({ verdict: 'unresolved' }),
      makeDep({ verdict: 'healthy', score: 90 }),
    ]
    const summary = buildSummary(deps)
    expect(summary.healthy).toBe(1)
    // pending and unresolved should not affect any count
    expect(summary.stable).toBe(0)
    expect(summary.degraded).toBe(0)
    expect(summary.critical).toBe(0)
    expect(summary.unmaintained).toBe(0)
  })
})

// ── hashManifest ───────────────────────────────────────────────────────
describe('hashManifest', () => {
  it('produces a deterministic hash', async () => {
    const content = '{"dependencies": {"hono": "^4.0.0"}}'
    const hash1 = await hashManifest(content)
    const hash2 = await hashManifest(content)
    expect(hash1).toBe(hash2)
  })

  it('produces different hashes for different content', async () => {
    const hash1 = await hashManifest('content-a')
    const hash2 = await hashManifest('content-b')
    expect(hash1).not.toBe(hash2)
  })

  it('produces a hex string (64 chars for SHA-256)', async () => {
    const hash = await hashManifest('test')
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('handles empty string', async () => {
    const hash = await hashManifest('')
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
  })
})
