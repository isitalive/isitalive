import { describe, expect, it } from 'vitest'
import { buildDrivers, buildProjectMetrics } from './insights'
import type { RawProjectData, SignalResult } from './types'

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
    lastCommitDate: new Date(Date.now() - 7 * 86400000).toISOString(),
    lastReleaseDate: new Date(Date.now() - 30 * 86400000).toISOString(),
    issueStalenessMedianDays: 5,
    issueSampleSize: 5,
    issueSampleLimit: 50,
    issueSamplingStrategy: 'median of the 50 most recently updated open issues',
    prResponsivenessMedianDays: 3,
    prSampleSize: 3,
    prSampleLimit: 20,
    prSamplingStrategy: 'median of the 20 most recently updated open pull requests',
    openIssueCount: 10,
    closedIssueCount: 100,
    openPrCount: 5,
    recentContributorCount: 8,
    contributorCommitSampleSize: 24,
    contributorWindowDays: 90,
    topContributorCommitShare: 0.3,
    hasCi: true,
    lastCiRunDate: new Date(Date.now() - 2 * 86400000).toISOString(),
    ciRunSuccessRate: 0.95,
    ciRunCount: 40,
    ciWorkflowRunSampleSize: 10,
    ciSamplingWindowDays: 30,
    ciDataSource: 'actions-runs',
    ...overrides,
  }
}

function makeSignal(overrides: Partial<SignalResult> = {}): SignalResult {
  return {
    name: 'issueStaleness',
    label: 'Issue Staleness',
    value: '0 days',
    score: 100,
    weight: 0.1,
    measurement: 'sampled-proxy',
    source: 'issues(first: 50, states: OPEN, orderBy: UPDATED_AT)',
    ...overrides,
  }
}

describe('buildDrivers', () => {
  it('describes zero open issues as inbox zero instead of a sample of 0', () => {
    const metrics = buildProjectMetrics(makeProject({
      issueStalenessMedianDays: null,
      issueSampleSize: 0,
      openIssueCount: 0,
      closedIssueCount: 12,
    }))

    const [driver] = buildDrivers([makeSignal()], metrics, 1)
    expect(driver.summary).toBe('There are currently no open issues, so issue triage is effectively at inbox zero.')
  })

  it('describes zero open pull requests as inbox zero instead of a sample of 0', () => {
    const metrics = buildProjectMetrics(makeProject({
      prResponsivenessMedianDays: null,
      prSampleSize: 0,
      openPrCount: 0,
      closedIssueCount: 12,
    }))

    const [driver] = buildDrivers([makeSignal({
      name: 'prResponsiveness',
      label: 'PR Responsiveness',
      weight: 0.15,
      source: 'pullRequests(first: 20, states: OPEN, orderBy: UPDATED_AT)',
    })], metrics, 1)

    expect(driver.summary).toBe('There are currently no open pull requests, so the review queue is effectively at inbox zero.')
  })
})
