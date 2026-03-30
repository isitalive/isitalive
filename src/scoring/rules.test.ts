import { describe, expect, it } from 'vitest'
import { RULES, type Rule } from './rules'
import type { RawProjectData } from './types'

/** Grab a rule by name */
function rule(name: string): Rule {
  const r = RULES.find(r => r.name === name)
  if (!r) throw new Error(`Unknown rule: ${name}`)
  return r
}

/** Build minimal project data with sensible defaults */
function makeData(overrides: Partial<RawProjectData> = {}): RawProjectData {
  return {
    archived: false,
    name: 'repo',
    owner: 'owner',
    description: null,
    stars: 100,
    forks: 10,
    defaultBranch: 'main',
    license: null,
    homepageUrl: null,
    language: null,
    languageColor: null,
    lastCommitDate: null,
    lastReleaseDate: null,
    issueStalenessMedianDays: null,
    issueSampleSize: 0,
    issueSampleLimit: 50,
    issueSamplingStrategy: 'median of the 50 most recently updated open issues',
    prResponsivenessMedianDays: null,
    prSampleSize: 0,
    prSampleLimit: 20,
    prSamplingStrategy: 'median of the 20 most recently updated open pull requests',
    openIssueCount: 0,
    closedIssueCount: 0,
    openPrCount: 0,
    recentContributorCount: 0,
    contributorCommitSampleSize: 0,
    contributorWindowDays: 90,
    topContributorCommitShare: 0,
    hasCi: false,
    lastCiRunDate: null,
    ciRunSuccessRate: null,
    ciRunCount: 0,
    ciWorkflowRunSampleSize: 0,
    ciSamplingWindowDays: 30,
    ciDataSource: 'none',
    ...overrides,
  }
}

function daysAgoISO(days: number): string {
  return new Date(Date.now() - days * 86400000).toISOString()
}

// ── Meta: weights must sum to 1.0 ──────────────────────────────────────
describe('rules metadata', () => {
  it('weights sum to 1.0', () => {
    const total = RULES.reduce((sum, r) => sum + r.weight, 0)
    expect(total).toBeCloseTo(1.0, 10)
  })

  it('every rule has a non-empty name and label', () => {
    for (const r of RULES) {
      expect(r.name).toBeTruthy()
      expect(r.label).toBeTruthy()
    }
  })

  it('all rule names are unique', () => {
    const names = RULES.map(r => r.name)
    expect(new Set(names).size).toBe(names.length)
  })
})

// ── Last Commit ────────────────────────────────────────────────────────
describe('lastCommit rule', () => {
  const r = rule('lastCommit')

  it('scores 100 for a commit within 30 days', () => {
    const result = r.evaluate(makeData({ lastCommitDate: daysAgoISO(10) }))
    expect(result.score).toBe(100)
  })

  it('scores 75 for a commit within 90 days', () => {
    const result = r.evaluate(makeData({ lastCommitDate: daysAgoISO(60) }))
    expect(result.score).toBe(75)
  })

  it('scores 50 for a commit within 180 days', () => {
    const result = r.evaluate(makeData({ lastCommitDate: daysAgoISO(120) }))
    expect(result.score).toBe(50)
  })

  it('scores 25 for a commit within 365 days', () => {
    const result = r.evaluate(makeData({ lastCommitDate: daysAgoISO(300) }))
    expect(result.score).toBe(25)
  })

  it('scores 0 for a commit older than 365 days', () => {
    const result = r.evaluate(makeData({ lastCommitDate: daysAgoISO(500) }))
    expect(result.score).toBe(0)
  })

  it('scores 0 when lastCommitDate is null', () => {
    const result = r.evaluate(makeData({ lastCommitDate: null }))
    expect(result.score).toBe(0)
  })

  it('gives stability override (100) for finished projects', () => {
    const result = r.evaluate(makeData({
      lastCommitDate: daysAgoISO(400),
      openIssueCount: 0,
      openPrCount: 0,
      closedIssueCount: 50,
    }))
    expect(result.score).toBe(100)
    expect(result.value).toBe('stable / complete')
  })

  it('does NOT give stability override when open issues exist', () => {
    const result = r.evaluate(makeData({
      lastCommitDate: daysAgoISO(400),
      openIssueCount: 5,
      openPrCount: 0,
      closedIssueCount: 50,
    }))
    expect(result.score).toBe(0) // >365 days
  })
})

// ── Last Release ───────────────────────────────────────────────────────
describe('lastRelease rule', () => {
  const r = rule('lastRelease')

  it('scores 100 for a release within 90 days', () => {
    const result = r.evaluate(makeData({ lastReleaseDate: daysAgoISO(30) }))
    expect(result.score).toBe(100)
  })

  it('scores 75 for a release within 180 days', () => {
    const result = r.evaluate(makeData({ lastReleaseDate: daysAgoISO(150) }))
    expect(result.score).toBe(75)
  })

  it('scores 50 for a release within 365 days', () => {
    const result = r.evaluate(makeData({ lastReleaseDate: daysAgoISO(300) }))
    expect(result.score).toBe(50)
  })

  it('scores 0 for a release older than 365 days', () => {
    const result = r.evaluate(makeData({ lastReleaseDate: daysAgoISO(400) }))
    expect(result.score).toBe(0)
  })

  it('scores 0 when no release exists', () => {
    const result = r.evaluate(makeData({ lastReleaseDate: null }))
    expect(result.score).toBe(0)
  })
})

// ── Issue Staleness ────────────────────────────────────────────────────
describe('issueStaleness rule', () => {
  const r = rule('issueStaleness')

  it('scores 100 for median ≤ 7 days', () => {
    const result = r.evaluate(makeData({ issueStalenessMedianDays: 5 }))
    expect(result.score).toBe(100)
  })

  it('scores 75 for median ≤ 30 days', () => {
    const result = r.evaluate(makeData({ issueStalenessMedianDays: 20 }))
    expect(result.score).toBe(75)
  })

  it('scores 50 for median ≤ 90 days', () => {
    const result = r.evaluate(makeData({ issueStalenessMedianDays: 60 }))
    expect(result.score).toBe(50)
  })

  it('scores 0 for median > 90 days (past all thresholds)', () => {
    const result = r.evaluate(makeData({ issueStalenessMedianDays: 120 }))
    expect(result.score).toBe(0)
  })

  it('scores 100 for null median with closed issues (inbox zero)', () => {
    const result = r.evaluate(makeData({
      issueStalenessMedianDays: null,
      closedIssueCount: 50,
    }))
    expect(result.score).toBe(100)
  })

  it('scores 75 for null median with no closed issues (ghost town)', () => {
    const result = r.evaluate(makeData({
      issueStalenessMedianDays: null,
      closedIssueCount: 0,
    }))
    expect(result.score).toBe(75)
  })
})

// ── PR Responsiveness ──────────────────────────────────────────────────
describe('prResponsiveness rule', () => {
  const r = rule('prResponsiveness')

  it('scores 100 for median ≤ 7 days', () => {
    const result = r.evaluate(makeData({ prResponsivenessMedianDays: 3 }))
    expect(result.score).toBe(100)
  })

  it('scores 75 for median ≤ 30 days', () => {
    const result = r.evaluate(makeData({ prResponsivenessMedianDays: 15 }))
    expect(result.score).toBe(75)
  })

  it('scores 0 for median > 90 days (past all thresholds)', () => {
    const result = r.evaluate(makeData({ prResponsivenessMedianDays: 100 }))
    expect(result.score).toBe(0)
  })

  it('scores 100 for null when closed issues exist', () => {
    const result = r.evaluate(makeData({
      prResponsivenessMedianDays: null,
      closedIssueCount: 20,
    }))
    expect(result.score).toBe(100)
  })

  it('scores 75 for null with no history', () => {
    const result = r.evaluate(makeData({
      prResponsivenessMedianDays: null,
      closedIssueCount: 0,
    }))
    expect(result.score).toBe(75)
  })
})

// ── Recent Contributors ────────────────────────────────────────────────
describe('recentContributors rule', () => {
  const r = rule('recentContributors')

  it('scores 100 for > 5 contributors', () => {
    expect(r.evaluate(makeData({ recentContributorCount: 10 })).score).toBe(100)
  })

  it('scores 75 for 2-5 contributors', () => {
    expect(r.evaluate(makeData({ recentContributorCount: 3 })).score).toBe(75)
  })

  it('scores 50 for 1 contributor', () => {
    expect(r.evaluate(makeData({ recentContributorCount: 1 })).score).toBe(50)
  })

  it('scores 0 for 0 contributors', () => {
    expect(r.evaluate(makeData({ recentContributorCount: 0 })).score).toBe(0)
  })
})

// ── Stars Trend ────────────────────────────────────────────────────────
describe('starsTrend rule', () => {
  const r = rule('starsTrend')

  it('scores 100 for >= 1000 stars', () => {
    expect(r.evaluate(makeData({ stars: 5000 })).score).toBe(100)
  })

  it('scores 75 for >= 100 stars', () => {
    expect(r.evaluate(makeData({ stars: 200 })).score).toBe(75)
  })

  it('scores 50 for >= 10 stars', () => {
    expect(r.evaluate(makeData({ stars: 15 })).score).toBe(50)
  })

  it('scores 25 for < 10 stars', () => {
    expect(r.evaluate(makeData({ stars: 3 })).score).toBe(25)
  })
})

// ── CI/CD Activity ─────────────────────────────────────────────────────
describe('ciActivity rule', () => {
  const r = rule('ciActivity')

  it('scores 0 when no CI is present', () => {
    const result = r.evaluate(makeData({ hasCi: false }))
    expect(result.score).toBe(0)
    expect(result.value).toBe('none')
  })

  it('scores 30 for CI configured but no runs', () => {
    const result = r.evaluate(makeData({
      hasCi: true,
      ciRunCount: 0,
      lastCiRunDate: null,
      ciRunSuccessRate: null,
    }))
    expect(result.score).toBe(30)
    expect(result.value).toBe('configured')
  })

  it('scores high for frequent, recent, successful CI', () => {
    const result = r.evaluate(makeData({
      hasCi: true,
      ciRunCount: 40,
      lastCiRunDate: daysAgoISO(2),
      ciRunSuccessRate: 0.95,
    }))
    expect(result.score).toBe(100)
  })

  it('scores moderately for infrequent CI with lower success rate', () => {
    const result = r.evaluate(makeData({
      hasCi: true,
      ciRunCount: 5,
      lastCiRunDate: daysAgoISO(20),
      ciRunSuccessRate: 0.6,
    }))
    // 30 (exists) + 20 (<=30d) + 10 (>=3 runs) + 10 (>=50% rate) = 70
    expect(result.score).toBe(70)
  })

  it('handles null success rate', () => {
    const result = r.evaluate(makeData({
      hasCi: true,
      ciRunCount: 5,
      lastCiRunDate: daysAgoISO(5),
      ciRunSuccessRate: null,
    }))
    // 30 + 30 + 10 + 0(null rate) = 70
    expect(result.score).toBe(70)
  })

  it('caps score at 100', () => {
    const result = r.evaluate(makeData({
      hasCi: true,
      ciRunCount: 100,
      lastCiRunDate: daysAgoISO(1),
      ciRunSuccessRate: 1.0,
    }))
    expect(result.score).toBeLessThanOrEqual(100)
  })
})

// ── Bus Factor ─────────────────────────────────────────────────────────
describe('busFactor rule', () => {
  const r = rule('busFactor')

  it('scores 100 for < 50% commit share', () => {
    expect(r.evaluate(makeData({ topContributorCommitShare: 0.3 })).score).toBe(100)
  })

  it('scores 75 for 50-70% commit share', () => {
    expect(r.evaluate(makeData({ topContributorCommitShare: 0.6 })).score).toBe(75)
  })

  it('scores 50 for 70-90% commit share', () => {
    expect(r.evaluate(makeData({ topContributorCommitShare: 0.8 })).score).toBe(50)
  })

  it('scores 25 for >= 90% share on large projects', () => {
    expect(r.evaluate(makeData({
      topContributorCommitShare: 0.95,
      stars: 5000,
    })).score).toBe(25)
  })

  it('gives solo-maintainer forgiveness for small projects', () => {
    const result = r.evaluate(makeData({
      topContributorCommitShare: 0.95,
      stars: 200,
    }))
    expect(result.score).toBe(85)
  })

  it('does NOT give forgiveness for large projects', () => {
    const result = r.evaluate(makeData({
      topContributorCommitShare: 0.95,
      stars: 2000,
    }))
    expect(result.score).toBe(25)
  })
})
