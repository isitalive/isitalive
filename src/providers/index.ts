// ---------------------------------------------------------------------------
// Shared provider registry + background revalidation helper
//
// Single source of truth for provider instances — avoids creating
// separate GitHubProvider objects across routes, audit scorer, and cron.
// ---------------------------------------------------------------------------

import type { Env, RawProjectData, ScoringResult } from '../scoring/types';
import { GitHubProvider } from './github';
import { scoreProject } from '../scoring/engine';
import { CacheManager } from '../cache/index';
import { buildProviderEvent } from '../events/provider';
import { buildResultEvent } from '../events/result';
import { emitAll } from '../pipeline/emit';

export const providers = {
  github: new GitHubProvider(),
} as const;

export type SupportedProvider = keyof typeof providers;
const INFLIGHT_SCORE_PREFIX = 'fetch-score:';
const REVALIDATE_LOCK_PREFIX = 'lock:revalidate:';
const REVALIDATE_LOCK_TTL_S = 30;
const inflightScores = new Map<string, Promise<{ rawData: RawProjectData; result: ScoringResult }>>();

function projectKey(provider: string, owner: string, repo: string): string {
  return `${provider}/${owner.toLowerCase()}/${repo.toLowerCase()}`
}

/**
 * Get a provider by name, throwing if unsupported.
 */
export function getProvider(name: string): (typeof providers)[SupportedProvider] {
  if (!Object.hasOwn(providers, name)) {
    throw new Error(`Unsupported provider: ${name}. Supported: ${Object.keys(providers).join(', ')}`);
  }
  return providers[name as SupportedProvider];
}

/**
 * Fetch and score a repo once per isolate, even if multiple requests race.
 */
export async function fetchAndScoreProject(
  env: Env,
  provider: string,
  owner: string,
  repo: string,
): Promise<{ rawData: RawProjectData; result: ScoringResult }> {
  const key = `${INFLIGHT_SCORE_PREFIX}${projectKey(provider, owner, repo)}`
  const existing = inflightScores.get(key)
  if (existing) return existing

  const promise = (async () => {
    const prov = getProvider(provider)
    const rawData = await prov.fetchProject(owner, repo, env.GITHUB_TOKEN)
    const result = scoreProject(rawData, prov.name)
    return { rawData, result }
  })().finally(() => {
    inflightScores.delete(key)
  })

  inflightScores.set(key, promise)
  return promise
}

async function acquireRevalidationLease(
  env: Env,
  provider: string,
  owner: string,
  repo: string,
): Promise<boolean> {
  const key = `${REVALIDATE_LOCK_PREFIX}${projectKey(provider, owner, repo)}`
  const existing = await env.CACHE_KV.get(key)
  if (existing) return false

  await env.CACHE_KV.put(key, String(Date.now()), {
    expirationTtl: REVALIDATE_LOCK_TTL_S,
  })
  return true
}

/**
 * Schedule at most one background revalidation per repo for a short window.
 */
export async function scheduleRevalidation(
  env: Env,
  ctx: ExecutionContext,
  provider: string,
  owner: string,
  repo: string,
): Promise<boolean> {
  const acquired = await acquireRevalidationLease(env, provider, owner, repo)
  if (!acquired) return false

  ctx.waitUntil(revalidateInBackground(env, provider, owner, repo))
  return true
}

/**
 * Background revalidation — fetches fresh data, scores it, and updates cache.
 * Used by check, badge, and UI routes for stale-while-revalidate.
 *
 * Archives the raw response via the Provider Pipeline.
 */
export async function revalidateInBackground(
  env: Env,
  provider: string,
  owner: string,
  repo: string,
): Promise<void> {
  try {
    const prov = getProvider(provider)
    const { rawData, result } = await fetchAndScoreProject(env, provider, owner, repo)
    const cacheManager = new CacheManager(env)
    await cacheManager.put(provider, owner, repo, result)
    // Archive raw data via Pipeline
    await emitAll(env, {
      provider: [buildProviderEvent(prov.name, owner, repo, rawData)],
      result: [buildResultEvent(result, 'revalidation')],
    })
  } catch {
    // Silently fail — stale data is still being served
  }
}
