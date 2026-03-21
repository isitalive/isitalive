import { describe, expect, it } from 'vitest'
import { scoreProject } from './engine'
import type { RawProjectData } from './types'

/** Build a complete RawProjectData with sensible defaults */
function makeProject(overrides: Partial<RawProjectData> = {}): RawProjectData {
  return {
    archived: false,
    name: 'test-repo',
    owner: 'test-owner',
    description: 'A test repository',
    stars: 500,
    forks: 50,
    defaultBranch: 'main',
    license: 'MIT',
    homepageUrl: null,
    language: 'TypeScript',
    languageColor: '#3178c6',
    lastCommitDate: new Date(Date.now() - 7 * 86400000).toISOString(),   // 7 days ago
    lastReleaseDate: new Date(Date.now() - 30 * 86400000).toISOString(), // 30 days ago
    issueStalenessMedianDays: 5,
    prResponsivenessMedianDays: 3,
    openIssueCount: 10,
    closedIssueCount: 100,
    openPrCount: 5,
    recentContributorCount: 8,
    topContributorCommitShare: 0.3,
    hasCi: true,
    lastCiRunDate: new Date(Date.now() - 2 * 86400000).toISOString(),
    ciRunSuccessRate: 0.95,
    ciRunCount: 40,
    ...overrides,
  }
}

describe('scoreProject', () => {
  // ── Archived repos ──────────────────────────────────────────────────
  it('returns score 0 and unmaintained for archived repos', () => {
    const result = scoreProject(makeProject({ archived: true }), 'github')
    expect(result.score).toBe(0)
    expect(result.verdict).toBe('unmaintained')
    expect(result.overrideReason).toContain('archived')
    expect(result.signals).toHaveLength(0)
  })

  it('populates metadata even for archived repos', () => {
    const result = scoreProject(makeProject({ archived: true }), 'github')
    expect(result.metadata).toBeDefined()
    expect(result.metadata!.description).toBe('A test repository')
    expect(result.metadata!.license).toBe('MIT')
  })

  // ── Healthy project ─────────────────────────────────────────────────
  it('scores a healthy project above 80', () => {
    const result = scoreProject(makeProject(), 'github')
    expect(result.score).toBeGreaterThanOrEqual(80)
    expect(result.verdict).toBe('healthy')
  })

  it('includes all 8 scoring signals', () => {
    const result = scoreProject(makeProject(), 'github')
    expect(result.signals).toHaveLength(8)
  })

  it('produces a project string in the expected format', () => {
    const result = scoreProject(makeProject(), 'github')
    expect(result.project).toBe('github/test-owner/test-repo')
    expect(result.provider).toBe('github')
  })

  it('sets cached to false (engine never caches)', () => {
    const result = scoreProject(makeProject(), 'github')
    expect(result.cached).toBe(false)
  })

  it('populates checkedAt as an ISO-8601 timestamp', () => {
    const result = scoreProject(makeProject(), 'github')
    expect(() => new Date(result.checkedAt)).not.toThrow()
    expect(new Date(result.checkedAt).toISOString()).toBe(result.checkedAt)
  })

  // ── Verdict boundaries ──────────────────────────────────────────────
  it('maps score >= 80 to healthy', () => {
    // A project with top marks across all signals should be healthy
    const result = scoreProject(makeProject(), 'github')
    expect(result.score).toBeGreaterThanOrEqual(80)
    expect(result.verdict).toBe('healthy')
  })

  it('maps a degraded project to the correct verdict', () => {
    const result = scoreProject(makeProject({
      lastCommitDate: new Date(Date.now() - 200 * 86400000).toISOString(),
      lastReleaseDate: null,
      issueStalenessMedianDays: 120,
      prResponsivenessMedianDays: 120,
      recentContributorCount: 1,
      stars: 5,
      hasCi: false,
      ciRunCount: 0,
      ciRunSuccessRate: null,
      lastCiRunDate: null,
      topContributorCommitShare: 0.95,
    }), 'github')
    expect(result.score).toBeLessThan(60)
    expect(['degraded', 'critical']).toContain(result.verdict)
  })

  it('maps a near-dead project to critical or unmaintained', () => {
    const result = scoreProject(makeProject({
      lastCommitDate: new Date(Date.now() - 500 * 86400000).toISOString(),
      lastReleaseDate: null,
      issueStalenessMedianDays: null,
      prResponsivenessMedianDays: null,
      openIssueCount: 200,
      closedIssueCount: 0,
      openPrCount: 50,
      recentContributorCount: 0,
      stars: 2,
      hasCi: false,
      ciRunCount: 0,
      ciRunSuccessRate: null,
      lastCiRunDate: null,
      topContributorCommitShare: 1,
    }), 'github')
    expect(result.score).toBeLessThan(40)
    expect(['critical', 'unmaintained']).toContain(result.verdict)
  })

  // ── Weighted sum ────────────────────────────────────────────────────
  it('produces a rounded integer score', () => {
    const result = scoreProject(makeProject(), 'github')
    expect(Number.isInteger(result.score)).toBe(true)
  })

  it('score is between 0 and 100 inclusive', () => {
    const result = scoreProject(makeProject(), 'github')
    expect(result.score).toBeGreaterThanOrEqual(0)
    expect(result.score).toBeLessThanOrEqual(100)
  })

  // ── Metadata passthrough ────────────────────────────────────────────
  it('passes through metadata fields without using them in scoring', () => {
    const result = scoreProject(makeProject({
      description: 'Custom description',
      license: 'Apache-2.0',
      homepageUrl: 'https://example.com',
      language: 'Rust',
      languageColor: '#dea584',
      stars: 1234,
      forks: 56,
    }), 'github')

    expect(result.metadata).toEqual({
      description: 'Custom description',
      license: 'Apache-2.0',
      homepageUrl: 'https://example.com',
      language: 'Rust',
      languageColor: '#dea584',
      stars: 1234,
      forks: 56,
    })
  })
})
