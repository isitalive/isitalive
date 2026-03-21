// ---------------------------------------------------------------------------
// Fuzz tests for the scoring engine — property-based invariants
// ---------------------------------------------------------------------------

import { describe, expect } from 'vitest'
import { test, fc } from '@fast-check/vitest'
import { scoreProject } from './engine'
import type { RawProjectData, Verdict } from './types'

const VALID_VERDICTS: Verdict[] = ['healthy', 'stable', 'degraded', 'critical', 'unmaintained']

// Arbitrary for ISO-8601 date strings within a realistic range
const isoDateArb = fc.integer({
  min: new Date('2015-01-01').getTime(),
  max: new Date('2026-12-31').getTime(),
}).map(ts => new Date(ts).toISOString())

const optionalIsoDate = fc.option(isoDateArb, { nil: null })

// Arbitrary that produces valid RawProjectData
const rawProjectDataArb: fc.Arbitrary<RawProjectData> = fc.record({
  archived: fc.boolean(),
  name: fc.stringMatching(/^[a-z][a-z0-9-]{0,30}$/),
  owner: fc.stringMatching(/^[a-z][a-z0-9-]{0,20}$/),
  description: fc.option(fc.lorem({ maxCount: 10 }), { nil: null }),
  stars: fc.nat({ max: 500000 }),
  forks: fc.nat({ max: 100000 }),
  defaultBranch: fc.constantFrom('main', 'master', 'develop'),
  license: fc.option(fc.constantFrom('MIT', 'Apache-2.0', 'GPL-3.0', 'BSD-3-Clause'), { nil: null }),
  homepageUrl: fc.option(fc.webUrl(), { nil: null }),
  language: fc.option(fc.constantFrom('TypeScript', 'Go', 'Rust', 'Python', 'Java'), { nil: null }),
  languageColor: fc.option(fc.stringMatching(/^[0-9a-f]{6}$/).map(s => `#${s}`), { nil: null }),
  lastCommitDate: optionalIsoDate,
  lastReleaseDate: optionalIsoDate,
  issueStalenessMedianDays: fc.option(fc.nat({ max: 3650 }), { nil: null }),
  prResponsivenessMedianDays: fc.option(fc.nat({ max: 3650 }), { nil: null }),
  openIssueCount: fc.nat({ max: 50000 }),
  closedIssueCount: fc.nat({ max: 500000 }),
  openPrCount: fc.nat({ max: 5000 }),
  recentContributorCount: fc.nat({ max: 1000 }),
  topContributorCommitShare: fc.double({ min: 0, max: 1, noNaN: true }),
  hasCi: fc.boolean(),
  lastCiRunDate: optionalIsoDate,
  ciRunSuccessRate: fc.option(fc.double({ min: 0, max: 1, noNaN: true }), { nil: null }),
  ciRunCount: fc.nat({ max: 10000 }),
})

describe('scoreProject fuzz', () => {
  test.prop([rawProjectDataArb])('score is always an integer between 0 and 100', (data) => {
    const result = scoreProject(data, 'github')
    expect(result.score).toBeGreaterThanOrEqual(0)
    expect(result.score).toBeLessThanOrEqual(100)
    expect(Number.isInteger(result.score)).toBe(true)
  })

  test.prop([rawProjectDataArb])('verdict is always one of the valid values', (data) => {
    const result = scoreProject(data, 'github')
    expect(VALID_VERDICTS).toContain(result.verdict)
  })

  test.prop([rawProjectDataArb])('verdict matches score range', (data) => {
    const result = scoreProject(data, 'github')
    const { score, verdict } = result
    if (score >= 80) expect(verdict).toBe('healthy')
    else if (score >= 60) expect(verdict).toBe('stable')
    else if (score >= 40) expect(verdict).toBe('degraded')
    else if (score >= 20) expect(verdict).toBe('critical')
    else expect(verdict).toBe('unmaintained')
  })

  test.prop([rawProjectDataArb])('archived repos always score 0 with unmaintained verdict', (data) => {
    const archived = { ...data, archived: true }
    const result = scoreProject(archived, 'github')
    expect(result.score).toBe(0)
    expect(result.verdict).toBe('unmaintained')
    expect(result.signals).toEqual([])
    expect(result.overrideReason).toBeDefined()
  })

  test.prop([rawProjectDataArb])('non-archived repos always have 8 signals', (data) => {
    const nonArchived = { ...data, archived: false }
    const result = scoreProject(nonArchived, 'github')
    expect(result.signals).toHaveLength(8)
  })

  test.prop([rawProjectDataArb])('signal weights sum to approximately 1.0', (data) => {
    const nonArchived = { ...data, archived: false }
    const result = scoreProject(nonArchived, 'github')
    if (result.signals.length > 0) {
      const totalWeight = result.signals.reduce((sum, s) => sum + s.weight, 0)
      expect(totalWeight).toBeCloseTo(1.0, 5)
    }
  })

  test.prop([rawProjectDataArb])('each signal score is between 0 and 100', (data) => {
    const nonArchived = { ...data, archived: false }
    const result = scoreProject(nonArchived, 'github')
    for (const signal of result.signals) {
      expect(signal.score).toBeGreaterThanOrEqual(0)
      expect(signal.score).toBeLessThanOrEqual(100)
    }
  })

  test.prop([rawProjectDataArb])('project string has correct format', (data) => {
    const result = scoreProject(data, 'github')
    expect(result.project).toBe(`github/${data.owner}/${data.name}`)
  })

  test.prop([rawProjectDataArb])('checkedAt is a valid ISO-8601 timestamp', (data) => {
    const result = scoreProject(data, 'github')
    expect(new Date(result.checkedAt).toISOString()).toBe(result.checkedAt)
  })

  test.prop([rawProjectDataArb])('cached is always false (engine never caches)', (data) => {
    const result = scoreProject(data, 'github')
    expect(result.cached).toBe(false)
  })
})
