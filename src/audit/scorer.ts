// ---------------------------------------------------------------------------
// Audit scorer — cache-first scoring with time budget
//
// 1. Hash the manifest content → check for a cached full audit result
// 2. If miss, batch-check KV for individual dep scores
// 3. Score uncached deps in parallel within a time budget
// 4. Use waitUntil to prime cache in the background after responding
// ---------------------------------------------------------------------------

import type { ResolvedDep } from './resolver';
import type {
  MethodologySummary,
  ProjectMetrics,
  ScoreDriver,
  ScoringResult,
  SignalResult,
} from '../scoring/types';
import { CacheManager, type Tier } from '../cache/index';
import { providers } from '../providers/index';
import { scoreProject } from '../scoring/engine';
import { METHODOLOGY } from '../scoring/methodology';
import { bufferToHex } from '../utils/crypto';
import type { Env } from '../types/env';

const github = providers.github;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AuditDep {
  /** Original package name */
  name: string;
  /** Version from manifest */
  version: string;
  /** Dev dependency? */
  dev: boolean;
  /** Ecosystem */
  ecosystem: 'npm' | 'go';
  /** Resolved GitHub path (e.g. "zitadel/zitadel") or null */
  github: string | null;
  /** Health score 0-100, or null if pending/unresolved */
  score: number | null;
  /** Verdict, or "pending"/"unresolved" */
  verdict: string;
  /** How the dependency was resolved to GitHub */
  resolvedFrom?: ResolvedDep['resolvedFrom'] | null;
  /** When the underlying repo score was computed */
  checkedAt?: string;
  /** Methodology used to compute the score */
  methodology?: MethodologySummary;
  /** Individual signal breakdowns, included on demand */
  signals?: SignalResult[];
  /** Top drivers, included on demand */
  drivers?: ScoreDriver[];
  /** Normalized raw metrics, included on demand */
  metrics?: ProjectMetrics;
  /** Whether this dep was freshly scored or served from cache */
  cacheStatus?: 'fresh' | 'cached' | 'pending' | 'unresolved';
  /** If unresolved, why */
  unresolvedReason?: string;
}

export interface AuditResult {
  /** SHA-256 hash of the manifest content — usable as ETag */
  auditHash: string;
  /** Whether all resolvable deps were scored */
  complete: boolean;
  /** Manifest format */
  format: string;
  /** Counts */
  scored: number;
  total: number;
  pending: number;
  unresolved: number;
  /** Deps freshly scored this request (consumed quota) vs served from cache */
  freshlyScored: number;
  /** If incomplete, suggested wait before retry (ms) */
  retryAfterMs?: number;
  /** Methodology used for all scored dependencies in this audit */
  methodology: MethodologySummary;
  /** Aggregate stats (only over scored deps) */
  summary: {
    healthy: number;
    stable: number;
    degraded: number;
    critical: number;
    unmaintained: number;
    avgScore: number;
  };
  /** Per-dependency results */
  dependencies: AuditDep[];
}

const AUDIT_CACHE_PREFIX = `audit:result:${METHODOLOGY.version}:`;
const AUDIT_CACHE_TTL = 6 * 60 * 60; // 6 hours
const AUDIT_CACHE_URL_PREFIX = `https://cache.isitalive.dev/api/manifest/${METHODOLOGY.version}/`;

export function buildAuditCacheKey(contentHash: string): string {
  return `${AUDIT_CACHE_PREFIX}${contentHash}`
}

export function buildAuditCacheUrl(contentHash: string, includeKey: string = 'base'): Request {
  return new Request(`${AUDIT_CACHE_URL_PREFIX}${contentHash}?include=${encodeURIComponent(includeKey)}`)
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Score resolved dependencies with a time budget.
 * Returns scored results and a `complete` flag.
 *
 * @param deps       Resolved dependencies
 * @param format     Original manifest format
 * @param contentHash SHA-256 of the raw manifest content
 * @param env        Worker env bindings
 * @param ctx        Execution context for waitUntil
 * @param budgetMs   Time budget in ms (default ~24s)
 */
export async function scoreAudit(
  deps: ResolvedDep[],
  format: string,
  contentHash: string,
  env: Env,
  ctx: ExecutionContext,
  tierOrBudget: Tier | number = 'free',
  maybeBudgetMs = 28_000,
): Promise<AuditResult> {
  const tier: Tier = typeof tierOrBudget === 'string' ? tierOrBudget : 'free'
  const budgetMs = typeof tierOrBudget === 'number' ? tierOrBudget : maybeBudgetMs
  const start = Date.now();
  const cacheManager = new CacheManager(env, ctx);

  // ── 1. Check for a cached full audit by manifest hash ──────────────
  const auditCacheKey = buildAuditCacheKey(contentHash);
  const cachedAudit = await env.CACHE_KV.get(auditCacheKey);
  if (cachedAudit) {
    const parsed = JSON.parse(cachedAudit) as AuditResult;
    if (parsed.complete) return parsed;
    // Partial cached result — we'll try to complete it below
  }

  // ── 2. Separate resolvable from unresolvable ───────────────────────
  const resolvable = deps.filter((d) => d.github !== null);
  const unresolvedDeps: AuditDep[] = deps
    .filter((d) => d.github === null)
    .map((d) => ({
      name: d.name,
      version: d.version,
      dev: d.dev,
      ecosystem: d.ecosystem,
      github: null,
      score: null,
      verdict: 'unresolved',
      resolvedFrom: d.resolvedFrom,
      checkedAt: undefined,
      methodology: undefined,
      cacheStatus: 'unresolved' as const,
      unresolvedReason: d.unresolvedReason,
    }));

  // ── 3. Batch check KV cache for existing scores ────────────────────
  const cacheChecks = await Promise.allSettled(
    resolvable.map(async (dep) => {
      const { owner, repo } = dep.github!;
      const cached = await cacheManager.get('github', owner, repo, tier);
      return { dep, cached };
    }),
  );

  const scored: AuditDep[] = [];
  const uncached: ResolvedDep[] = [];

  for (const result of cacheChecks) {
    if (result.status === 'rejected') continue;
    const { dep, cached } = result.value;

    if ((cached.status === 'l2-hit' || cached.status === 'l1-hit' || cached.status === 'l2-stale') && cached.result) {
      scored.push(depToAudit(dep, cached.result, 'cached'));
    } else {
      uncached.push(dep);
    }
  }

  // ── 4. Score uncached deps within time budget ──────────────────────
  const remaining: AuditDep[] = [];
  const batchSize = 20;
  let timedOut = false;

  for (let i = 0; i < uncached.length; i += batchSize) {
    // Check time budget before each batch
    const elapsed = Date.now() - start;
    if (elapsed > budgetMs) {
      timedOut = true;
      // Add remaining as pending
      for (let j = i; j < uncached.length; j++) {
        remaining.push({
          name: uncached[j].name,
          version: uncached[j].version,
          dev: uncached[j].dev,
          ecosystem: uncached[j].ecosystem,
          github: `${uncached[j].github!.owner}/${uncached[j].github!.repo}`,
          score: null,
          verdict: 'pending',
          resolvedFrom: uncached[j].resolvedFrom,
          checkedAt: undefined,
          methodology: undefined,
          cacheStatus: 'pending',
        });
      }
      break;
    }

    const batch = uncached.slice(i, i + batchSize);
    const results = await Promise.allSettled(
      batch.map(async (dep) => {
        const { owner, repo } = dep.github!;
        try {
          const rawData = await github.fetchProject(owner, repo, env.GITHUB_TOKEN);
          const result = scoreProject(rawData, 'github');
          // Cache in background
          ctx.waitUntil(cacheManager.put('github', owner, repo, result));
          return { dep, result, error: null as string | null };
        } catch (err: any) {
          const is404 = err.message?.includes('not found');
          return { dep, result: null, error: is404 ? 'repo_not_found' : 'scoring_error' };
        }
      }),
    );

    for (const r of results) {
      if (r.status === 'rejected') continue;
      const { dep, result, error } = r.value;
      if (result) {
        scored.push(depToAudit(dep, result, 'fresh'));
      } else {
        // Scoring failed — treat as unresolved (not pending), it's not recoverable
        unresolvedDeps.push({
          name: dep.name,
          version: dep.version,
          dev: dep.dev,
          ecosystem: dep.ecosystem,
          github: `${dep.github!.owner}/${dep.github!.repo}`,
          score: null,
          verdict: 'unresolved',
          resolvedFrom: dep.resolvedFrom,
          checkedAt: undefined,
          methodology: undefined,
          cacheStatus: 'unresolved',
          unresolvedReason: error ?? 'scoring_error',
        });
      }
    }

    // Brief pause between batches to avoid GitHub secondary rate limits
    if (i + batchSize < uncached.length && !timedOut) {
      await sleep(50);
    }
  }

  // ── 5. Build result ────────────────────────────────────────────────
  const allDeps = [...scored, ...remaining, ...unresolvedDeps];
  // Sort: scored first (by score desc), then pending, then unresolved
  allDeps.sort((a, b) => {
    if (a.score !== null && b.score !== null) return b.score - a.score;
    if (a.score !== null) return -1;
    if (b.score !== null) return 1;
    return 0;
  });

  const complete = remaining.length === 0;
  const scoredCount = scored.length;
  const pendingCount = remaining.length;
  const freshCount = scored.filter(d => d.cacheStatus === 'fresh').length;

  const summary = buildSummary(scored);

  const auditResult: AuditResult = {
    auditHash: contentHash,
    complete,
    format,
    scored: scoredCount,
    total: deps.length,
    pending: pendingCount,
    unresolved: unresolvedDeps.length,
    freshlyScored: freshCount,
    methodology: METHODOLOGY,
    summary,
    dependencies: allDeps,
  };

  if (!complete) {
    // Scale retry hint based on how many deps remain vs how many we scored
    // Background priming processes ~20 per 2s, so estimate accordingly
    const estimatedSeconds = Math.ceil(remaining.length / 20) * 2;
    auditResult.retryAfterMs = Math.max(1000, Math.min(estimatedSeconds * 1000, 10_000));
  }

  // ── 6. Persist current audit state immediately ─────────────────────
  await persistAuditResult(env, auditCacheKey, auditResult)

  // If incomplete, finish the remaining deps in the background and promote
  // the manifest-hash cache entry to a complete result.
  if (!complete && remaining.length > 0) {
    ctx.waitUntil(completeAuditInBackground(remaining, auditResult, auditCacheKey, contentHash, env));
  }

  return auditResult;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function depToAudit(dep: ResolvedDep, result: ScoringResult, cacheStatus: 'fresh' | 'cached'): AuditDep {
  return {
    name: dep.name,
    version: dep.version,
    dev: dep.dev,
    ecosystem: dep.ecosystem,
    github: `${dep.github!.owner}/${dep.github!.repo}`,
    score: result.score,
    verdict: result.verdict,
    resolvedFrom: dep.resolvedFrom,
    checkedAt: result.checkedAt,
    methodology: result.methodology,
    signals: result.signals,
    drivers: result.drivers,
    metrics: result.metrics,
    cacheStatus,
  };
}

export function buildSummary(scored: AuditDep[]) {
  const counts = { healthy: 0, stable: 0, degraded: 0, critical: 0, unmaintained: 0 };
  let totalScore = 0;

  for (const d of scored) {
    if (d.verdict in counts) {
      counts[d.verdict as keyof typeof counts]++;
    }
    totalScore += d.score ?? 0;
  }

  return {
    ...counts,
    avgScore: scored.length > 0 ? Math.round(totalScore / scored.length) : 0,
  };
}

/**
 * Continue scoring deps in the background via waitUntil.
 * This primes the KV cache so the next call returns instantly.
 */
async function completeAuditInBackground(
  remaining: AuditDep[],
  currentResult: AuditResult,
  auditCacheKey: string,
  contentHash: string,
  env: Env,
): Promise<void> {
  const cacheManager = new CacheManager(env);
  const replacements = new Map<string, AuditDep>()
  // Process in parallel batches of 10 (less aggressive than foreground)
  const bgBatchSize = 10;
  for (let i = 0; i < remaining.length; i += bgBatchSize) {
    const batch = remaining.slice(i, i + bgBatchSize);
    const results = await Promise.allSettled(
      batch.map(async (dep) => {
        if (!dep.github) return;
        const [owner, repo] = dep.github.split('/');
        try {
          const rawData = await github.fetchProject(owner, repo, env.GITHUB_TOKEN);
          const result = scoreProject(rawData, 'github');
          await cacheManager.put('github', owner, repo, result);
          replacements.set(dep.github, {
            ...dep,
            score: result.score,
            verdict: result.verdict,
            checkedAt: result.checkedAt,
            methodology: result.methodology,
            signals: result.signals,
            drivers: result.drivers,
            metrics: result.metrics,
            cacheStatus: 'fresh',
          })
        } catch {
          replacements.set(dep.github, {
            ...dep,
            score: null,
            verdict: 'unresolved',
            cacheStatus: 'unresolved',
            unresolvedReason: 'scoring_error',
          })
        }
      }),
    )

    for (const result of results) {
      if (result.status === 'rejected') continue
    }
    // Small pause between background batches
    if (i + bgBatchSize < remaining.length) {
      await sleep(100);
    }
  }

  const finalDeps = currentResult.dependencies
    .map((dep) => dep.cacheStatus === 'pending' && dep.github
      ? (replacements.get(dep.github) ?? {
          ...dep,
          score: null,
          verdict: 'unresolved' as const,
          cacheStatus: 'unresolved' as const,
          unresolvedReason: 'scoring_error',
        } satisfies AuditDep)
      : dep,
    )
    .sort((a, b) => {
      if (a.score !== null && b.score !== null) return b.score - a.score
      if (a.score !== null) return -1
      if (b.score !== null) return 1
      return 0
    })

  const scoredDeps = finalDeps.filter((dep) => dep.score !== null)
  const finalResult: AuditResult = {
    ...currentResult,
    complete: true,
    pending: 0,
    unresolved: finalDeps.filter((dep) => dep.verdict === 'unresolved').length,
    freshlyScored: finalDeps.filter((dep) => dep.cacheStatus === 'fresh').length,
    retryAfterMs: undefined,
    summary: buildSummary(scoredDeps),
    dependencies: finalDeps,
  }

  await persistAuditResult(env, auditCacheKey, finalResult)
}

async function persistAuditResult(
  env: Env,
  auditCacheKey: string,
  auditResult: AuditResult,
): Promise<void> {
  const json = JSON.stringify(auditResult)
  await env.CACHE_KV.put(auditCacheKey, json, {
    expirationTtl: AUDIT_CACHE_TTL,
  })
}

/** Hash manifest content using SHA-256 */
export async function hashManifest(content: string): Promise<string> {
  const data = new TextEncoder().encode(content);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return bufferToHex(hashBuffer);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
