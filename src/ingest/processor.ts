import type { Env } from '../types/env'
import { providers } from '../providers/index'
import { scoreProject } from '../scoring/engine'
import { CacheManager } from '../cache/index'
import { buildResultEvent } from '../events/result'
import { buildProviderEvent } from '../events/provider'
import { createEvent } from '../events/envelope'
import type { UsageEvent } from '../events/usage'
import { emitAll } from '../pipeline/emit'
import { markDiscoveredRepoRefreshed } from './discovered'
import {
  appendScoreHistory,
  computeTrend,
  getScoreHistory,
  type ScoreSnapshot,
  type Trend,
  type TrendDirection,
} from '../aggregate/history'

const github = providers.github;

/**
 * Process a list of repos in batches: fetch, score, cache, archive, and analytics.
 * Returns the number of successfully processed repos.
 */
export async function processRepos(env: Env, repos: string[]): Promise<number> {
  if (repos.length === 0) return 0;
  console.log(`Ingest Processor: starting run with ${repos.length} repos`);

  // Deduplicate array
  const uniqueRepos = [...new Set(repos)];
  
  let successCount = 0;
  const batchSize = 10;

  for (let i = 0; i < uniqueRepos.length; i += batchSize) {
    const batch = uniqueRepos.slice(i, i + batchSize);
    const results = await Promise.allSettled(
      batch.map(repo => snapshotRepo(env, repo)),
    );

    for (const r of results) {
      if (r.status === 'fulfilled' && r.value) successCount++;
    }

    // Small delay between batches to be kind to GitHub API
    if (i + batchSize < uniqueRepos.length) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  console.log(`Ingest Processor: completed ${successCount}/${uniqueRepos.length} repos`);
  return successCount;
}

export async function snapshotRepo(env: Env, repoSlug: string): Promise<boolean> {
  const parts = repoSlug.split('/');
  if (parts.length < 2) return false;
  const [owner, repo] = parts;

  const cacheManager = new CacheManager(env);

  try {
    const rawData = await github.fetchProject(owner, repo, env.GITHUB_TOKEN);
    const result = scoreProject(rawData, github.name);
    const today = new Date().toISOString().slice(0, 10);

    await Promise.all([
      cacheManager.put('github', owner, repo, result),
      appendScoreHistory(env, repoSlug, {
        date: today,
        score: result.score,
        verdict: result.verdict,
      }),
      markDiscoveredRepoRefreshed(env, 'github', repoSlug),
      // Pipeline: result + provider + usage events
      emitAll(env, {
        result: [buildResultEvent(result, 'cron-daily')],
        provider: [buildProviderEvent('github', owner, repo, rawData)],
        usage: [createEvent('usage', {
          repo: repoSlug.toLowerCase(),
          provider: 'github',
          score: result.score,
          verdict: result.verdict,
          source: 'cron',
          api_key: 'system',
          cache_status: 'l3-miss',
          country: 'XX',
          user_agent: 'cron',
          response_time_ms: 0,
          ip_hash: 'system',
          oidc_repository: null,
          oidc_owner: null,
        }) as UsageEvent],
      }),
    ])

    return true;
  } catch (err) {
    console.error(`Ingest Processor: failed to snapshot ${repoSlug}:`, err);
    return false;
  }
}

export { appendScoreHistory, computeTrend, getScoreHistory }
export type { ScoreSnapshot, Trend, TrendDirection }
