// ---------------------------------------------------------------------------
// GitHub App — Check Run report formatter
//
// Converts isitalive audit results into a GitHub Check Run output with:
// - A markdown summary table
// - Inline annotations on critical/unmaintained dependencies
// - A pass/fail conclusion based on a score threshold
// ---------------------------------------------------------------------------

import type { AuditResult, AuditDep } from '../audit/scorer';
import type { CheckRunOutput, CheckAnnotation } from './api';
import type { GitHubAppConfig, DEFAULT_CONFIG } from './types';

// Verdict → emoji for the markdown table
const VERDICT_EMOJI: Record<string, string> = {
  healthy: '🟢',
  stable: '🟡',
  degraded: '🟠',
  critical: '🔴',
  unmaintained: '⚫',
  pending: '⏳',
  unresolved: '❓',
};

/**
 * Determine the check run conclusion from audit results.
 */
export function getConclusion(
  result: AuditResult,
  threshold: number,
): 'success' | 'failure' {
  if (result.scored === 0) return 'success'; // No scored deps → pass
  return result.summary.avgScore >= threshold ? 'success' : 'failure';
}

/**
 * Build a GitHub Check Run output from audit results.
 */
export function buildCheckRunOutput(
  result: AuditResult,
  manifestPath: string,
  config: GitHubAppConfig,
): CheckRunOutput {
  const conclusion = getConclusion(result, config.scoreThreshold);
  const emoji = conclusion === 'success' ? '✅' : '❌';

  // ── Summary ────────────────────────────────────────────────────────
  const summaryParts: string[] = [];

  summaryParts.push(
    `${emoji} **Dependency Health Audit** — avg score **${result.summary.avgScore}**/100 ` +
    `(threshold: ${config.scoreThreshold})`,
  );

  summaryParts.push('');
  summaryParts.push(`| Metric | Count |`);
  summaryParts.push(`|--------|-------|`);
  summaryParts.push(`| 🟢 Healthy (80-100) | ${result.summary.healthy} |`);
  summaryParts.push(`| 🟡 Stable (60-79) | ${result.summary.stable} |`);
  summaryParts.push(`| 🟠 Degraded (40-59) | ${result.summary.degraded} |`);
  summaryParts.push(`| 🔴 Critical (20-39) | ${result.summary.critical} |`);
  summaryParts.push(`| ⚫ Unmaintained (0-19) | ${result.summary.unmaintained} |`);

  if (result.unresolved > 0) {
    summaryParts.push(`| ❓ Unresolved | ${result.unresolved} |`);
  }

  summaryParts.push('');
  summaryParts.push(
    `**${result.scored}** of **${result.total}** dependencies scored` +
    (result.pending > 0 ? ` (${result.pending} pending)` : '') +
    '.',
  );

  // ── Detail table ───────────────────────────────────────────────────
  const textParts: string[] = [];
  textParts.push('## Dependency Details\n');
  textParts.push('| Package | Score | Verdict | GitHub |');
  textParts.push('|---------|-------|---------|--------|');

  for (const dep of result.dependencies) {
    const emoji = VERDICT_EMOJI[dep.verdict] ?? '❓';
    const scoreStr = dep.score !== null ? String(dep.score) : '—';
    const ghLink = dep.github
      ? `[${dep.github}](https://isitalive.dev/api/check/github/${dep.github})`
      : '—';
    const devTag = dep.dev ? ' `dev`' : '';

    textParts.push(
      `| ${dep.name}${devTag} | ${scoreStr} | ${emoji} ${dep.verdict} | ${ghLink} |`,
    );
  }

  // ── Annotations ────────────────────────────────────────────────────
  const annotations = buildAnnotations(result.dependencies, manifestPath, config.maxAnnotations);

  return {
    title: conclusion === 'success'
      ? `Passed — avg score ${result.summary.avgScore}/100`
      : `Failed — avg score ${result.summary.avgScore}/100 (threshold: ${config.scoreThreshold})`,
    summary: summaryParts.join('\n'),
    text: textParts.join('\n'),
    annotations: annotations.length > 0 ? annotations : undefined,
  };
}

/**
 * Build inline annotations for critical and unmaintained dependencies.
 *
 * We annotate on line 1 of the manifest file because we don't track
 * per-dep line numbers. GitHub shows these as file-level annotations.
 */
function buildAnnotations(
  deps: AuditDep[],
  manifestPath: string,
  maxAnnotations: number,
): CheckAnnotation[] {
  const risky = deps.filter(
    d => d.verdict === 'critical' || d.verdict === 'unmaintained',
  );

  return risky.slice(0, maxAnnotations).map(dep => ({
    path: manifestPath,
    start_line: 1,
    end_line: 1,
    annotation_level: dep.verdict === 'unmaintained' ? 'failure' as const : 'warning' as const,
    title: `${dep.name}: ${dep.verdict} (score: ${dep.score ?? '?'})`,
    message: dep.github
      ? `${dep.name} is ${dep.verdict}. Check: https://isitalive.dev/${dep.github}`
      : `${dep.name} is ${dep.verdict}. Could not resolve to a GitHub repository.`,
  }));
}
