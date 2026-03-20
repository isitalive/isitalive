// ---------------------------------------------------------------------------
// Scoring engine — orchestrates rules and produces the final verdict
// ---------------------------------------------------------------------------

import type { RawProjectData, ScoringResult, Verdict, ProviderName, ProjectMetadata } from './types';
import { RULES } from './rules';

/** Map a 0-100 score to a human-readable verdict */
function toVerdict(score: number): Verdict {
  if (score >= 80) return 'healthy';
  if (score >= 60) return 'maintained';
  if (score >= 40) return 'inactive';
  if (score >= 20) return 'dormant';
  return 'unmaintained';
}

/**
 * Run the full scoring pipeline against raw project data.
 *
 * If the project is archived, the score is forced to 0 / "abandoned"
 * without evaluating any other rules.
 */
export function scoreProject(
  data: RawProjectData,
  provider: ProviderName,
): ScoringResult {
  const project = `${provider}/${data.owner}/${data.name}`;
  const checkedAt = new Date().toISOString();

  // Build metadata once (shared by both paths)
  const metadata: ProjectMetadata = {
    description: data.description,
    license: data.license,
    homepageUrl: data.homepageUrl,
    language: data.language,
    languageColor: data.languageColor,
    stars: data.stars,
    forks: data.forks,
  };

  // ── Instant-fail: archived repos ──────────────────────────────────
  if (data.archived) {
    return {
      project,
      provider,
      score: 0,
      verdict: 'unmaintained',
      checkedAt,
      cached: false,
      signals: [],
      overrideReason: 'Repository is archived — score forced to 0.',
      metadata,
    };
  }

  // ── Evaluate all rules ────────────────────────────────────────────
  const signals = RULES.map((rule) => rule.evaluate(data));

  // Weighted sum
  const score = Math.round(
    signals.reduce((sum, s) => sum + s.score * s.weight, 0),
  );

  return {
    project,
    provider,
    score,
    verdict: toVerdict(score),
    checkedAt,
    cached: false,
    signals,
    metadata,
  };
}
