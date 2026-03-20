import { describe, expect, it } from 'vitest';
import { buildCheckRunOutput, getConclusion } from '../github/report';
import type { AuditResult } from '../audit/scorer';
import { DEFAULT_CONFIG } from '../github/types';

function makeAuditResult(overrides: Partial<AuditResult> = {}): AuditResult {
  return {
    auditHash: 'abc123',
    complete: true,
    format: 'package.json',
    scored: 3,
    total: 4,
    pending: 0,
    unresolved: 1,
    summary: {
      healthy: 1,
      stable: 1,
      degraded: 1,
      critical: 0,
      unmaintained: 0,
      avgScore: 70,
    },
    dependencies: [
      { name: 'hono', version: '^4.0.0', dev: false, ecosystem: 'npm', github: 'honojs/hono', score: 90, verdict: 'healthy' },
      { name: 'lodash', version: '^4.17.0', dev: false, ecosystem: 'npm', github: 'lodash/lodash', score: 65, verdict: 'stable' },
      { name: 'old-lib', version: '^1.0.0', dev: false, ecosystem: 'npm', github: 'someone/old-lib', score: 55, verdict: 'degraded' },
      { name: 'internal-pkg', version: '^1.0.0', dev: true, ecosystem: 'npm', github: null, score: null, verdict: 'unresolved', unresolvedReason: 'no_github_repo' },
    ],
    ...overrides,
  };
}

describe('getConclusion', () => {
  it('returns success when avg score meets threshold', () => {
    const result = makeAuditResult({ summary: { ...makeAuditResult().summary, avgScore: 70 } });
    expect(getConclusion(result, 40)).toBe('success');
  });

  it('returns failure when avg score is below threshold', () => {
    const result = makeAuditResult({ summary: { ...makeAuditResult().summary, avgScore: 30 } });
    expect(getConclusion(result, 40)).toBe('failure');
  });

  it('returns success when no deps are scored', () => {
    const result = makeAuditResult({ scored: 0 });
    expect(getConclusion(result, 40)).toBe('success');
  });

  it('returns success when score equals threshold exactly', () => {
    const result = makeAuditResult({ summary: { ...makeAuditResult().summary, avgScore: 40 } });
    expect(getConclusion(result, 40)).toBe('success');
  });
});

describe('buildCheckRunOutput', () => {
  it('builds a valid output structure', () => {
    const result = makeAuditResult();
    const output = buildCheckRunOutput(result, 'package.json', DEFAULT_CONFIG);

    expect(output.title).toContain('70/100');
    expect(output.summary).toContain('Dependency Health Audit');
    expect(output.summary).toContain('70');
    expect(output.text).toContain('hono');
    expect(output.text).toContain('lodash');
  });

  it('includes the summary table', () => {
    const result = makeAuditResult();
    const output = buildCheckRunOutput(result, 'package.json', DEFAULT_CONFIG);

    expect(output.summary).toContain('Healthy');
    expect(output.summary).toContain('Stable');
    expect(output.summary).toContain('Degraded');
  });

  it('uses ✅ for passing checks', () => {
    const result = makeAuditResult();
    const output = buildCheckRunOutput(result, 'package.json', DEFAULT_CONFIG);
    expect(output.summary).toContain('✅');
  });

  it('uses ❌ for failing checks', () => {
    const result = makeAuditResult({
      summary: { ...makeAuditResult().summary, avgScore: 20 },
    });
    const output = buildCheckRunOutput(result, 'package.json', DEFAULT_CONFIG);
    expect(output.summary).toContain('❌');
  });

  it('generates annotations for critical deps', () => {
    const result = makeAuditResult({
      dependencies: [
        { name: 'dead-lib', version: '1.0.0', dev: false, ecosystem: 'npm' as const, github: 'owner/dead-lib', score: 5, verdict: 'unmaintained' },
        { name: 'risky-lib', version: '2.0.0', dev: false, ecosystem: 'npm' as const, github: 'owner/risky-lib', score: 25, verdict: 'critical' },
      ],
    });
    const output = buildCheckRunOutput(result, 'package.json', DEFAULT_CONFIG);

    expect(output.annotations).toHaveLength(2);
    expect(output.annotations![0].annotation_level).toBe('failure');
    expect(output.annotations![1].annotation_level).toBe('warning');
  });

  it('omits annotations when no risky deps', () => {
    const result = makeAuditResult({
      dependencies: [
        { name: 'hono', version: '^4.0.0', dev: false, ecosystem: 'npm' as const, github: 'honojs/hono', score: 90, verdict: 'healthy' },
      ],
    });
    const output = buildCheckRunOutput(result, 'package.json', DEFAULT_CONFIG);
    expect(output.annotations).toBeUndefined();
  });
});
