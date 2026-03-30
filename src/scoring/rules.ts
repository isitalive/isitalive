// ---------------------------------------------------------------------------
// Individual scoring rules — pure functions that map raw data to 0-100 scores
// ---------------------------------------------------------------------------

import type { RawProjectData, SignalResult } from './types';
import {
  BUS_FACTOR_THRESHOLDS,
  CONTRIBUTOR_THRESHOLDS,
  getSignalDefinition,
  LAST_COMMIT_THRESHOLDS,
  LAST_RELEASE_THRESHOLDS,
  RESPONSIVENESS_THRESHOLDS,
  STAR_THRESHOLDS,
} from './methodology';

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
  name: SignalResult['name'];
  label: string;
  weight: number;
  measurement: SignalResult['measurement'];
  source: SignalResult['source'];
  evaluate(data: RawProjectData): SignalResult;
}

export const RULES: Rule[] = [
  // ── Last Commit ──────────────────────────────────────────────────────
  {
    ...getSignalDefinition('lastCommit'),
    evaluate(data) {
      const days = daysAgo(data.lastCommitDate);

      // Stability override: if it's been over a year but the project has
      // 0 open issues/PRs and a history of closed issues, it's "finished",
      // not "abandoned". Think: legendary utility packages.
      if (
        days !== null && days > 365 &&
        data.openIssueCount === 0 &&
        data.openPrCount === 0 &&
        data.closedIssueCount > 10
      ) {
        return {
          name: this.name,
          label: this.label,
          value: 'stable / complete',
          score: 100,
          weight: this.weight,
          measurement: this.measurement,
          source: this.source,
        };
      }

      const score = freshnessScore(
        days,
        LAST_COMMIT_THRESHOLDS
          .filter((row) => row.maxDays !== undefined)
          .map((row) => [row.maxDays!, row.score]),
      );
      return {
        name: this.name,
        label: this.label,
        value: data.lastCommitDate ?? 'never',
        score,
        weight: this.weight,
        measurement: this.measurement,
        source: this.source,
      };
    },
  },

  // ── Last Release ─────────────────────────────────────────────────────
  {
    ...getSignalDefinition('lastRelease'),
    evaluate(data) {
      const days = daysAgo(data.lastReleaseDate);
      const score = freshnessScore(
        days,
        LAST_RELEASE_THRESHOLDS
          .filter((row) => row.maxDays !== undefined)
          .map((row) => [row.maxDays!, row.score]),
        0,
      );
      return {
        name: this.name,
        label: this.label,
        value: data.lastReleaseDate ?? 'never',
        score,
        weight: this.weight,
        measurement: this.measurement,
        source: this.source,
      };
    },
  },

  // ── Issue Staleness ──────────────────────────────────────────────────
  {
    ...getSignalDefinition('issueStaleness'),
    evaluate(data) {
      const days = data.issueStalenessMedianDays;
      let score: number;

      if (days === null) {
        // Differentiate "inbox zero hero" from "ghost town"
        score = data.closedIssueCount > 0 ? 100 : 75;
      } else {
        score = freshnessScore(
          days,
          RESPONSIVENESS_THRESHOLDS
            .filter((row) => row.maxDays !== undefined)
            .map((row) => [row.maxDays!, row.score]),
          25,
        );
      }

      return {
        name: this.name,
        label: this.label,
        value: days !== null ? `${days}d median` : (data.closedIssueCount > 0 ? 'inbox zero' : 'no issues'),
        score,
        weight: this.weight,
        measurement: this.measurement,
        source: this.source,
      };
    },
  },

  // ── PR Responsiveness ────────────────────────────────────────────────
  {
    ...getSignalDefinition('prResponsiveness'),
    evaluate(data) {
      const days = data.prResponsivenessMedianDays;
      let score: number;

      if (days === null) {
        // No open PRs: if they've closed issues before, they're on top of it
        score = data.closedIssueCount > 0 ? 100 : 75;
      } else {
        score = freshnessScore(
          days,
          RESPONSIVENESS_THRESHOLDS
            .filter((row) => row.maxDays !== undefined)
            .map((row) => [row.maxDays!, row.score]),
          25,
        );
      }

      return {
        name: this.name,
        label: this.label,
        value: days !== null ? `${days}d median` : (data.openPrCount === 0 ? 'inbox zero' : 'no PRs'),
        score,
        weight: this.weight,
        measurement: this.measurement,
        source: this.source,
      };
    },
  },

  // ── Recent Contributors ──────────────────────────────────────────────
  {
    ...getSignalDefinition('recentContributors'),
    evaluate(data) {
      const n = data.recentContributorCount;
      let score = CONTRIBUTOR_THRESHOLDS[CONTRIBUTOR_THRESHOLDS.length - 1].score;
      if (n >= (CONTRIBUTOR_THRESHOLDS[0].minValue ?? Infinity)) score = CONTRIBUTOR_THRESHOLDS[0].score;
      else if (n >= (CONTRIBUTOR_THRESHOLDS[1].minValue ?? Infinity)) score = CONTRIBUTOR_THRESHOLDS[1].score;
      else if (n >= (CONTRIBUTOR_THRESHOLDS[2].minValue ?? Infinity)) score = CONTRIBUTOR_THRESHOLDS[2].score;
      return {
        name: this.name,
        label: this.label,
        value: n,
        score,
        weight: this.weight,
        measurement: this.measurement,
        source: this.source,
      };
    },
  },

  // ── Stars Trend ──────────────────────────────────────────────────────
  {
    ...getSignalDefinition('starsTrend'),
    evaluate(data) {
      // For v1 we just check absolute star count as a proxy for community
      // Real trend tracking will come when we have KV historical data
      const s = data.stars;
      let score = STAR_THRESHOLDS[STAR_THRESHOLDS.length - 1].score;
      if (s >= (STAR_THRESHOLDS[0].minValue ?? Infinity)) score = STAR_THRESHOLDS[0].score;
      else if (s >= (STAR_THRESHOLDS[1].minValue ?? Infinity)) score = STAR_THRESHOLDS[1].score;
      else if (s >= (STAR_THRESHOLDS[2].minValue ?? Infinity)) score = STAR_THRESHOLDS[2].score;
      return {
        name: this.name,
        label: this.label,
        value: s,
        score,
        weight: this.weight,
        measurement: this.measurement,
        source: this.source,
      };
    },
  },

  // ── CI/CD Activity ──────────────────────────────────────────────────
  {
    ...getSignalDefinition('ciActivity'),
    evaluate(data) {
      // No workflows at all → 0
      if (!data.hasCi) {
        return {
          name: this.name,
          label: this.label,
          value: 'none',
          score: 0,
          weight: this.weight,
          measurement: this.measurement,
          source: this.source,
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
          measurement: this.measurement,
          source: this.source,
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
        measurement: this.measurement,
        source: this.source,
      };
    },
  },

  // ── Bus Factor ───────────────────────────────────────────────────────
  {
    ...getSignalDefinition('busFactor'),
    evaluate(data) {
      const share = data.topContributorCommitShare;
      let score: number;

      // Solo-maintainer forgiveness: small projects (<1000 stars)
      // with a single maintainer are normal, not risky.
      if (share >= 0.9 && data.stars < 1000) {
        score = 85;
      } else {
        const sharePct = Math.round(share * 100);
        if (sharePct < (BUS_FACTOR_THRESHOLDS[0].maxValue ?? 50)) score = BUS_FACTOR_THRESHOLDS[0].score;
        else if (sharePct <= (BUS_FACTOR_THRESHOLDS[1].maxValue ?? 69)) score = BUS_FACTOR_THRESHOLDS[1].score;
        else if (sharePct <= (BUS_FACTOR_THRESHOLDS[2].maxValue ?? 89)) score = BUS_FACTOR_THRESHOLDS[2].score;
        else score = BUS_FACTOR_THRESHOLDS[3].score;
      }

      return {
        name: this.name,
        label: this.label,
        value: `${Math.round(share * 100)}%`,
        score,
        weight: this.weight,
        measurement: this.measurement,
        source: this.source,
      };
    },
  },
];
