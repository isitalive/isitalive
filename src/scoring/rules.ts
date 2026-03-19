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

  // ── CI/CD Activity ──────────────────────────────────────────────────
  {
    name: 'ciActivity',
    label: 'CI/CD',
    weight: 0.05,
    evaluate(data) {
      // No workflows at all → 0
      if (!data.hasCi) {
        return {
          name: this.name,
          label: this.label,
          value: 'none',
          score: 0,
          weight: this.weight,
        };
      }

      // Has workflows but no run data → base score for having CI
      if (data.ciRunCount === 0 && !data.lastCiRunDate) {
        return {
          name: this.name,
          label: this.label,
          value: 'configured',
          score: 30,
          weight: this.weight,
        };
      }

      // Multi-factor scoring:
      //   30pts — workflows exist (already passed)
      //   30pts — last run recency
      //   20pts — run frequency (past 30 days)
      //   20pts — success rate
      let score = 30;

      // Recency of last run (30pts)
      if (data.lastCiRunDate) {
        const days = daysAgo(data.lastCiRunDate) ?? 999;
        if (days <= 7) score += 30;
        else if (days <= 30) score += 20;
        else if (days <= 90) score += 10;
      }

      // Run frequency — 30+ runs/month = full marks (20pts)
      if (data.ciRunCount >= 30) score += 20;
      else if (data.ciRunCount >= 10) score += 15;
      else if (data.ciRunCount >= 3) score += 10;
      else if (data.ciRunCount >= 1) score += 5;

      // Success rate (20pts)
      if (data.ciRunSuccessRate !== null) {
        if (data.ciRunSuccessRate >= 0.9) score += 20;
        else if (data.ciRunSuccessRate >= 0.7) score += 15;
        else if (data.ciRunSuccessRate >= 0.5) score += 10;
        else score += 5;
      }

      // Build a display value
      const successPct = data.ciRunSuccessRate !== null
        ? `${Math.round(data.ciRunSuccessRate * 100)}% pass`
        : 'no data';
      const displayValue = `${data.ciRunCount} runs/30d · ${successPct}`;

      return {
        name: this.name,
        label: this.label,
        value: displayValue,
        score: Math.min(100, score),
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
