// ---------------------------------------------------------------------------
// Score insights — normalized metrics + top score drivers
// ---------------------------------------------------------------------------

import type {
  ProjectMetrics,
  RawProjectData,
  ScoreDriver,
  SignalResult,
} from './types'

function daysAgo(isoDate: string | null): number | null {
  if (!isoDate) return null
  const diff = Date.now() - new Date(isoDate).getTime()
  return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)))
}

export function buildProjectMetrics(data: RawProjectData): ProjectMetrics {
  return {
    archived: data.archived,
    defaultBranch: data.defaultBranch,
    stars: data.stars,
    forks: data.forks,
    openIssueCount: data.openIssueCount,
    closedIssueCount: data.closedIssueCount,
    openPrCount: data.openPrCount,
    lastCommitDate: data.lastCommitDate,
    lastCommitAgeDays: daysAgo(data.lastCommitDate),
    lastReleaseDate: data.lastReleaseDate,
    lastReleaseAgeDays: daysAgo(data.lastReleaseDate),
    issueStalenessMedianDays: data.issueStalenessMedianDays,
    issueSampleSize: data.issueSampleSize,
    issueSampleLimit: data.issueSampleLimit,
    issueSamplingStrategy: data.issueSamplingStrategy,
    prResponsivenessMedianDays: data.prResponsivenessMedianDays,
    prSampleSize: data.prSampleSize,
    prSampleLimit: data.prSampleLimit,
    prSamplingStrategy: data.prSamplingStrategy,
    recentContributorCount: data.recentContributorCount,
    contributorCommitSampleSize: data.contributorCommitSampleSize,
    contributorWindowDays: data.contributorWindowDays,
    topContributorCommitShare: data.topContributorCommitShare,
    hasCi: data.hasCi,
    lastCiRunDate: data.lastCiRunDate,
    lastCiRunAgeDays: daysAgo(data.lastCiRunDate),
    ciRunSuccessRate: data.ciRunSuccessRate,
    ciRunCount: data.ciRunCount,
    ciWorkflowRunSampleSize: data.ciWorkflowRunSampleSize,
    ciSamplingWindowDays: data.ciSamplingWindowDays,
    ciDataSource: data.ciDataSource,
  }
}

function buildDriverSummary(signal: SignalResult, metrics: ProjectMetrics): string {
  switch (signal.name) {
    case 'lastCommit':
      return signal.score >= 75
        ? `Default branch activity is recent (${metrics.lastCommitAgeDays ?? 'unknown'} days ago).`
        : `Default branch activity is aging (${metrics.lastCommitAgeDays ?? 'unknown'} days since the latest commit).`
    case 'lastRelease':
      return signal.score >= 75
        ? `Recent release activity is visible (${metrics.lastReleaseAgeDays ?? 'unknown'} days since the latest release).`
        : 'Release activity is sparse or absent.'
    case 'issueStaleness':
      if (metrics.issueSampleSize === 0) {
        return 'There are currently no open issues, so issue triage is effectively at inbox zero.'
      }
      return signal.score >= 75
        ? `Issue triage looks active across a sample of ${metrics.issueSampleSize} recently updated open issues.`
        : `Open issue follow-up looks slow across a sample of ${metrics.issueSampleSize} recently updated open issues.`
    case 'prResponsiveness':
      if (metrics.prSampleSize === 0) {
        return 'There are currently no open pull requests, so the review queue is effectively at inbox zero.'
      }
      return signal.score >= 75
        ? `PR updates look responsive across a sample of ${metrics.prSampleSize} recently updated open pull requests.`
        : `Open pull requests are aging across a sample of ${metrics.prSampleSize} recently updated open pull requests.`
    case 'recentContributors':
      return signal.score >= 75
        ? `Contributor activity is distributed across ${metrics.recentContributorCount} recent authors.`
        : `Recent contributor activity is concentrated in ${metrics.recentContributorCount} author${metrics.recentContributorCount === 1 ? '' : 's'}.`
    case 'busFactor':
      return signal.score >= 75
        ? `Recent commit ownership is reasonably distributed (${Math.round(metrics.topContributorCommitShare * 100)}% from the top contributor).`
        : `Recent commit ownership is concentrated (${Math.round(metrics.topContributorCommitShare * 100)}% from the top contributor).`
    case 'ciActivity':
      return signal.score >= 75
        ? `CI is active with ${metrics.ciRunCount} runs in the last ${metrics.ciSamplingWindowDays} days.`
        : metrics.hasCi
          ? `CI exists but recent execution quality is limited (${metrics.ciRunCount} runs in ${metrics.ciSamplingWindowDays} days).`
          : 'No CI workflows were detected.'
    case 'starsTrend':
      return signal.score >= 75
        ? `The project has meaningful community attention (${metrics.stars} stars).`
        : `Community attention is limited (${metrics.stars} stars), so the score relies more heavily on maintenance signals.`
  }
}

export function buildDrivers(
  signals: SignalResult[],
  metrics: ProjectMetrics,
  limit = 3,
): ScoreDriver[] {
  return [...signals]
    .map((signal) => ({
      signal: signal.name,
      label: signal.label,
      direction: signal.score >= 50 ? 'positive' as const : 'negative' as const,
      weight: signal.weight,
      score: signal.score,
      contribution: Number((signal.weight * (signal.score - 50)).toFixed(2)),
      summary: buildDriverSummary(signal, metrics),
    }))
    .sort((left, right) => {
      const impactDelta = Math.abs(right.contribution) - Math.abs(left.contribution)
      if (impactDelta !== 0) return impactDelta
      return right.weight - left.weight
    })
    .slice(0, limit)
}
