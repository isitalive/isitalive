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
  Verdict,
} from '../scoring/types';
import { CacheManager, type Tier } from '../cache/index';
import { providers } from '../providers/index';
import { classifyError, isProviderError } from '../providers/errors';
import { scoreProject } from '../scoring/engine';
import { METHODOLOGY } from '../scoring/methodology';
import { bufferToHex } from '../utils/crypto';
import { runWithConcurrency } from '../utils/concurrency';
import type { Env } from '../types/env';
import { auditCacheGetText, auditCachePutText } from '../db/state';
import {
  aggregatePolicyVerdict,
  buildDataFreshness,
  buildIdentity,
  buildResolution,
  evaluatePolicy,
  riskFlagsFor,
  stateFromFailure,
  topDrivers,
  type AgentDataFreshness,
  type AgentDependencyIdentity,
  type AgentDependencyResolution,
  type AgentPolicy,
  type AgentPolicyResult,
  type AgentState,
  type PolicyVerdict,
} from './agent';
import type { CacheResult } from '../cache/index';

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
  ecosystem: ResolvedDep['ecosystem'];
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
  /** Canonical package identity for agents */
  identity?: AgentDependencyIdentity;
  /** Canonical resolution metadata for agents */
  resolution?: AgentDependencyResolution;
  /** Processing state separate from maintenance-health verdict */
  state?: AgentState;
  /** Maintenance-health verdict only; null when not scored */
  healthVerdict?: Verdict | null;
  /** Cache and freshness metadata for this dependency score */
  dataFreshness?: AgentDataFreshness;
  /** Compact top drivers for policy-style decisions */
  topDrivers?: ScoreDriver[];
  /** Machine-readable risk flags */
  riskFlags?: string[];
  /** Optional policy evaluation result */
  policy?: AgentPolicyResult;
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
  /** Optional aggregate policy verdict */
  policyVerdict?: PolicyVerdict;
}

export interface ScoreAuditOptions {
  tier?: Tier;
  budgetMs?: number;
  policy?: AgentPolicy;
  maxAgeSeconds?: number;
  preferFresh?: boolean;
}

const AUDIT_CACHE_PREFIX = `audit:result:${METHODOLOGY.version}:agent-v1:`;
const AUDIT_CACHE_TTL = 6 * 60 * 60; // 6 hours
const AUDIT_CACHE_URL_PREFIX = `https://cache.isitalive.dev/api/manifest/${METHODOLOGY.version}/agent-v1/`;

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
  tierOrBudget: Tier | number | ScoreAuditOptions = 'free',
  maybeBudgetMs = 28_000,
): Promise<AuditResult> {
  const options = normalizeScoreAuditOptions(tierOrBudget, maybeBudgetMs)
  const tier = options.tier
  const budgetMs = options.budgetMs
  const hasRequestSpecificOptions = Boolean(options.policy || options.maxAgeSeconds !== undefined || options.preferFresh)
  const start = Date.now();
  const cacheManager = new CacheManager(env, ctx);

  // ── 1. Check for a cached full audit by manifest hash ──────────────
  const auditCacheKey = buildAuditCacheKey(contentHash);
  if (!hasRequestSpecificOptions) {
    const cachedAudit = await auditCacheGetText(env, auditCacheKey);
    if (cachedAudit) {
      const parsed = JSON.parse(cachedAudit) as AuditResult;
      if (parsed.complete) return parsed;
      // Partial cached result — we'll try to complete it below
    }
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
      ...agentFieldsForDep(d, null, 'unresolved', tier, undefined, options, d.unresolvedReason),
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
  const staleFallbacks = new Map<string, { dep: ResolvedDep; cached: CacheResult }>();

  for (let i = 0; i < cacheChecks.length; i++) {
    const result = cacheChecks[i];
    const dep = resolvable[i];
    if (result.status === 'rejected') {
      uncached.push(dep);
      continue;
    }
    const { cached } = result.value;

    if ((cached.status === 'l2-hit' || cached.status === 'l1-hit' || cached.status === 'l2-stale') && cached.result) {
      if (shouldRefreshCached(cached, options)) {
        staleFallbacks.set(depKey(dep), { dep, cached });
        uncached.push(dep);
      } else {
        scored.push(depToAudit(dep, cached.result, 'cached', tier, cached, options));
      }
    } else {
      uncached.push(dep);
    }
  }

  // ── 4. Score uncached deps within time budget ──────────────────────
  // Runs up to 20 concurrent GitHub fetches. `shouldStop` fires once the
  // budget is blown; still-queued items come back as `skipped` and are
  // surfaced as `pending` below.
  const remaining: AuditDep[] = [];
  const scoreResults = await runWithConcurrency(
    uncached,
    async (dep) => {
      const { owner, repo } = dep.github!;
      try {
        const rawData = await github.fetchProject(owner, repo, env.GITHUB_TOKEN);
        const result = scoreProject(rawData, 'github');
        ctx.waitUntil(cacheManager.put('github', owner, repo, result));
        return { result, error: null as string | null };
      } catch (err: unknown) {
        const is404 = isProviderError(err) && err.code === 'not_found';
        return { result: null, error: is404 ? 'repo_not_found' : classifyError(err) };
      }
    },
    {
      limit: 20,
      shouldStop: () => Date.now() - start > budgetMs,
    },
  );

  for (let i = 0; i < uncached.length; i++) {
    const dep = uncached[i];
    const entry = scoreResults[i];

    if (entry.status === 'skipped') {
      remaining.push({
        name: dep.name,
        version: dep.version,
        dev: dep.dev,
        ecosystem: dep.ecosystem,
        github: `${dep.github!.owner}/${dep.github!.repo}`,
        score: null,
        verdict: 'pending',
        resolvedFrom: dep.resolvedFrom,
        checkedAt: undefined,
        methodology: undefined,
        cacheStatus: 'pending',
        ...agentFieldsForDep(dep, null, 'pending', tier, undefined, options, undefined, true),
      });
      continue;
    }

    if (entry.status === 'fulfilled' && entry.value.result) {
      scored.push(depToAudit(dep, entry.value.result, 'fresh', tier, undefined, options));
      continue;
    }

    const reason = entry.status === 'fulfilled' ? (entry.value.error ?? 'scoring_error') : 'scoring_error';
    const fallback = staleFallbacks.get(depKey(dep));
    if (fallback?.cached.result) {
      scored.push(depToAudit(dep, fallback.cached.result, 'cached', tier, fallback.cached, options));
      continue;
    }

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
      unresolvedReason: reason,
      ...agentFieldsForDep(dep, null, 'unresolved', tier, undefined, options, reason),
    });
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
    policyVerdict: aggregatePolicyVerdict(allDeps.map((dep) => dep.policy)),
  };

  if (!complete) {
    // Scale retry hint based on how many deps remain vs how many we scored
    // Background priming processes ~20 per 2s, so estimate accordingly
    const estimatedSeconds = Math.ceil(remaining.length / 20) * 2;
    auditResult.retryAfterMs = Math.max(1000, Math.min(estimatedSeconds * 1000, 10_000));
  }

  // ── 6. Persist current audit state immediately ─────────────────────
  if (!hasRequestSpecificOptions) {
    await persistAuditResult(env, auditCacheKey, auditResult)
  }

  // If incomplete, finish the remaining deps in the background and promote
  // the manifest-hash cache entry to a complete result.
  if (!hasRequestSpecificOptions && !complete && remaining.length > 0) {
    ctx.waitUntil(completeAuditInBackground(remaining, auditResult, auditCacheKey, env, tier, options));
  }

  return auditResult;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function depToAudit(
  dep: ResolvedDep,
  result: ScoringResult,
  cacheStatus: 'fresh' | 'cached',
  tier: Tier,
  cacheMeta: CacheResult | undefined,
  options: ScoreAuditOptions,
): AuditDep {
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
    ...agentFieldsForDep(dep, result, cacheStatus, tier, cacheMeta, options),
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
  env: Env,
  tier: Tier,
  options: ScoreAuditOptions,
): Promise<void> {
  const cacheManager = new CacheManager(env);
  const replacements = new Map<string, AuditDep>()

  // Less aggressive than foreground — 10 concurrent, no shouldStop (runs to completion).
  await runWithConcurrency(
    remaining,
    async (dep) => {
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
          state: 'resolved',
          healthVerdict: result.verdict,
          dataFreshness: buildDataFreshness(result.checkedAt, 'fresh', tier, undefined, options.maxAgeSeconds),
          riskFlags: riskFlagsFor('resolved', buildDataFreshness(result.checkedAt, 'fresh', tier, undefined, options.maxAgeSeconds)),
          topDrivers: topDrivers(result.drivers),
          policy: evaluatePolicy({
            score: result.score,
            state: 'resolved',
            dev: dep.dev,
            dependencyType: dep.identity?.dependencyType ?? (dep.dev ? 'dev' : 'direct'),
            healthVerdict: result.verdict,
            resolution: dep.resolution ?? { provider: null, repo: null, source: null, confidence: 'none' },
            metrics: result.metrics,
          }, options.policy),
        })
      } catch {
        const state = stateFromFailure('scoring_error')
        const dataFreshness = buildDataFreshness(undefined, 'unresolved', tier, undefined, options.maxAgeSeconds)
        replacements.set(dep.github, {
          ...dep,
          score: null,
          verdict: 'unresolved',
          cacheStatus: 'unresolved',
          unresolvedReason: 'scoring_error',
          state,
          healthVerdict: null,
          dataFreshness,
          riskFlags: riskFlagsFor(state, dataFreshness),
          policy: evaluatePolicy({
            score: null,
            state,
            dev: dep.dev,
            dependencyType: dep.identity?.dependencyType ?? (dep.dev ? 'dev' : 'direct'),
            healthVerdict: null,
            resolution: dep.resolution ?? { provider: null, repo: null, source: null, confidence: 'none' },
            metrics: undefined,
          }, options.policy),
        })
      }
    },
    { limit: 10 },
  )

  const finalDeps = currentResult.dependencies
    .map((dep) => dep.cacheStatus === 'pending' && dep.github
      ? (replacements.get(dep.github) ?? failedPendingDep(dep, tier, options))
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
    policyVerdict: aggregatePolicyVerdict(finalDeps.map((dep) => dep.policy)),
  }

  await persistAuditResult(env, auditCacheKey, finalResult)
}

function failedPendingDep(dep: AuditDep, tier: Tier, options: ScoreAuditOptions): AuditDep {
  const state = stateFromFailure('scoring_error')
  const dataFreshness = buildDataFreshness(undefined, 'unresolved', tier, undefined, options.maxAgeSeconds)
  return {
    ...dep,
    score: null,
    verdict: 'unresolved',
    cacheStatus: 'unresolved',
    unresolvedReason: 'scoring_error',
    state,
    healthVerdict: null,
    dataFreshness,
    riskFlags: riskFlagsFor(state, dataFreshness),
    policy: evaluatePolicy({
      score: null,
      state,
      dev: dep.dev,
      dependencyType: dep.identity?.dependencyType ?? (dep.dev ? 'dev' : 'direct'),
      healthVerdict: null,
      resolution: dep.resolution ?? { provider: null, repo: null, source: null, confidence: 'none' },
      metrics: undefined,
    }, options.policy),
  }
}

function normalizeScoreAuditOptions(
  tierOrBudget: Tier | number | ScoreAuditOptions,
  maybeBudgetMs: number,
): Required<Pick<ScoreAuditOptions, 'tier' | 'budgetMs'>> & Omit<ScoreAuditOptions, 'tier' | 'budgetMs'> {
  if (typeof tierOrBudget === 'number') {
    return { tier: 'free', budgetMs: tierOrBudget }
  }
  if (typeof tierOrBudget === 'string') {
    return { tier: tierOrBudget, budgetMs: maybeBudgetMs }
  }
  return {
    tier: tierOrBudget.tier ?? 'free',
    budgetMs: tierOrBudget.budgetMs ?? maybeBudgetMs,
    policy: tierOrBudget.policy,
    maxAgeSeconds: tierOrBudget.maxAgeSeconds,
    preferFresh: tierOrBudget.preferFresh,
  }
}

function shouldRefreshCached(cached: CacheResult, options: ScoreAuditOptions): boolean {
  if (!cached.result) return false
  if (options.preferFresh && cached.status === 'l2-stale') return true
  if (typeof options.maxAgeSeconds !== 'number') return false
  const ageSeconds = cached.ageSeconds ?? ageSecondsFromIso(cached.result.checkedAt)
  return ageSeconds !== null && ageSeconds > options.maxAgeSeconds
}

function depKey(dep: ResolvedDep): string {
  return `${dep.ecosystem}:${dep.name}:${dep.version}:${dep.github?.owner ?? ''}/${dep.github?.repo ?? ''}`
}

function agentFieldsForDep(
  dep: ResolvedDep,
  result: ScoringResult | null,
  cacheStatus: 'fresh' | 'cached' | 'pending' | 'unresolved',
  tier: Tier,
  cacheMeta: CacheResult | undefined,
  options: ScoreAuditOptions,
  failureReason?: string,
  pending = false,
): Pick<AuditDep, 'identity' | 'resolution' | 'state' | 'healthVerdict' | 'dataFreshness' | 'riskFlags' | 'topDrivers' | 'policy'> {
  const identity = buildIdentity(dep)
  const resolution = buildResolution(dep)
  const state = result ? 'resolved' : stateFromFailure(failureReason, pending)
  const freshnessStatus: 'fresh' | 'pending' | 'unresolved' | CacheResult['status'] = result
    ? (cacheStatus === 'fresh' ? 'fresh' : cacheMeta?.status ?? 'fresh')
    : (cacheStatus === 'cached' ? 'fresh' : cacheStatus)
  const dataFreshness = buildDataFreshness(
    result?.checkedAt,
    freshnessStatus,
    tier,
    cacheMeta,
    options.maxAgeSeconds,
  )
  const policy = evaluatePolicy({
    score: result?.score ?? null,
    state,
    dev: dep.dev,
    dependencyType: dep.dependencyType,
    healthVerdict: result?.verdict ?? null,
    resolution,
    metrics: result?.metrics,
  }, options.policy)

  return {
    identity,
    resolution,
    state,
    healthVerdict: result?.verdict ?? null,
    dataFreshness,
    riskFlags: riskFlagsFor(state, dataFreshness),
    topDrivers: topDrivers(result?.drivers),
    policy,
  }
}

function ageSecondsFromIso(iso: string): number | null {
  const time = Date.parse(iso)
  if (!Number.isFinite(time)) return null
  return Math.max(0, Math.round((Date.now() - time) / 1000))
}

async function persistAuditResult(
  env: Env,
  auditCacheKey: string,
  auditResult: AuditResult,
): Promise<void> {
  const json = JSON.stringify(auditResult)
  await auditCachePutText(env, auditCacheKey, auditResult.auditHash, json, {
    expirationTtl: AUDIT_CACHE_TTL,
  })
}

/** Hash manifest content using SHA-256 */
export async function hashManifest(content: string): Promise<string> {
  const data = new TextEncoder().encode(content);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return bufferToHex(hashBuffer);
}
