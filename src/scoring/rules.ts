// ---------------------------------------------------------------------------
// Individual scoring rules — pure functions that map raw data to 0-100 scores
// ---------------------------------------------------------------------------

import type { RawProjectData, SignalResult } from './types';

/** Helper: days between a date string and now */
function daysAgo(isoDate: string | null): number | null {
  if (!isoDate) return null;
  const diff = Date.now() - new Date(isoDate).getTime();
  return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
}

/** Helper: score from a freshness ladder (lower days = better) */
function freshnessScore(
  days: number | null,
  thresholds: [number, number][], // [[maxDays, score], ...] ordered tightest first
  nullScore: number = 0,
): number {
  if (days === null) return nullScore;
  for (const [maxDays, score] of thresholds) {
    if (days <= maxDays) return score;
  }
  return 0;
}

// ---------------------------------------------------------------------------
// Rule definitions
// ---------------------------------------------------------------------------

export interface Rule {
  name: string;
  label: string;
  weight: number;
  evaluate(data: RawProjectData): SignalResult;
}

export const RULES: Rule[] = [
  // ── Last Commit ──────────────────────────────────────────────────────
  {
    name: 'lastCommit',
    label: 'Last Commit',
    weight: 0.25,
    evaluate(data) {
      const days = daysAgo(data.lastCommitDate);
      const score = freshnessScore(days, [
        [30, 100],
        [90, 75],
        [180, 50],
        [365, 25],
      ]);
      return {
        name: this.name,
        label: this.label,
        value: data.lastCommitDate ?? 'never',
        score,
        weight: this.weight,
      };
    },
  },

  // ── Last Release ─────────────────────────────────────────────────────
  {
    name: 'lastRelease',
    label: 'Last Release',
    weight: 0.15,
    evaluate(data) {
      const days = daysAgo(data.lastReleaseDate);
      const score = freshnessScore(days, [
        [90, 100],
        [180, 75],
        [365, 50],
      ], 0);
      return {
        name: this.name,
        label: this.label,
        value: data.lastReleaseDate ?? 'never',
        score,
        weight: this.weight,
      };
    },
  },

  // ── Issue Staleness ──────────────────────────────────────────────────
  {
    name: 'issueStaleness',
    label: 'Issue Staleness',
    weight: 0.10,
    evaluate(data) {
      const days = data.issueStalenessMedianDays;
      // No open issues is a good sign (or the project just doesn't use issues)
      const score = days === null
        ? 75
        : freshnessScore(days, [
            [7, 100],
            [30, 75],
            [90, 50],
          ], 25);
      return {
        name: this.name,
        label: this.label,
        value: days !== null ? `${days}d median` : 'no issues',
        score,
        weight: this.weight,
      };
    },
  },

  // ── PR Responsiveness ────────────────────────────────────────────────
  {
    name: 'prResponsiveness',
    label: 'PR Responsiveness',
    weight: 0.15,
    evaluate(data) {
      const days = data.prResponsivenessMedianDays;
      const score = days === null
        ? 75
        : freshnessScore(days, [
            [7, 100],
            [30, 75],
            [90, 50],
          ], 25);
      return {
        name: this.name,
        label: this.label,
        value: days !== null ? `${days}d median` : 'no PRs',
        score,
        weight: this.weight,
      };
    },
  },

  // ── Recent Contributors ──────────────────────────────────────────────
  {
    name: 'recentContributors',
    label: 'Recent Contributors',
    weight: 0.10,
    evaluate(data) {
      const n = data.recentContributorCount;
      let score: number;
      if (n > 5) score = 100;
      else if (n >= 2) score = 75;
      else if (n === 1) score = 50;
      else score = 0;
      return {
        name: this.name,
        label: this.label,
        value: n,
        score,
        weight: this.weight,
      };
    },
  },

  // ── Stars Trend ──────────────────────────────────────────────────────
  {
    name: 'starsTrend',
    label: 'Stars',
    weight: 0.05,
    evaluate(data) {
      // For v1 we just check absolute star count as a proxy for community
      // Real trend tracking will come when we have KV historical data
      const s = data.stars;
      let score: number;
      if (s >= 1000) score = 100;
      else if (s >= 100) score = 75;
      else if (s >= 10) score = 50;
      else score = 25;
      return {
        name: this.name,
        label: this.label,
        value: s,
        score,
        weight: this.weight,
      };
    },
  },

  // ── Has CI/CD ────────────────────────────────────────────────────────
  {
    name: 'hasCi',
    label: 'CI/CD',
    weight: 0.05,
    evaluate(data) {
      const score = data.hasCi ? 100 : 0;
      return {
        name: this.name,
        label: this.label,
        value: data.hasCi,
        score,
        weight: this.weight,
      };
    },
  },

  // ── Bus Factor ───────────────────────────────────────────────────────
  {
    name: 'busFactor',
    label: 'Bus Factor',
    weight: 0.10,
    evaluate(data) {
      const share = data.topContributorCommitShare;
      let score: number;
      if (share < 0.5) score = 100;
      else if (share < 0.7) score = 75;
      else if (share < 0.9) score = 50;
      else score = 25;
      return {
        name: this.name,
        label: this.label,
        value: `${Math.round(share * 100)}%`,
        score,
        weight: this.weight,
      };
    },
  },
];
