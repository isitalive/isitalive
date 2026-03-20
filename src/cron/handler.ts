// ---------------------------------------------------------------------------
// Cron handler — periodic maintenance + daily snapshot
//
// Every 10 min: Dispatches RefreshWorkflow and refreshes sitemap from
//              tracked repos index. Trending is computed in real-time
//              by the Queue consumer — no polling needed.
//
// Daily (6AM UTC): Dispatches the IngestWorkflow to re-check top repos.
// ---------------------------------------------------------------------------

import type { Env } from '../scoring/types';
import { getTrackedIndex } from '../queue/tracked';

const TRENDING_KV_KEY = 'isitalive:trending';
const SITEMAP_KV_KEY = 'isitalive:sitemap_repos';

export interface TrendingRepo {
  repo: string;       // "owner/repo"
  checks: number;     // check count in last 24h
  avgScore: number;   // average score
  lastVerdict: string; // most recent verdict
}

/**
 * Scheduled (Cron) handler — routes to periodic or daily based on cron.
 */
export async function handleScheduled(env: Env, trigger?: string): Promise<{ trending: TrendingRepo[]; sitemap: string[]; snapshots?: number; error?: string }> {
  try {
    // Trending is now computed in real-time by the Queue consumer.
    const trending = await getTrending(env.CACHE_KV);

    // Sitemap — derived from tracked repos index (sorted by request count)
    const trackedIndex = await getTrackedIndex(env.CACHE_KV);
    const sitemap = Object.entries(trackedIndex)
      .sort((a, b) => b[1].requestCount - a[1].requestCount)
      .slice(0, 5000)
      .map(([repo]) => repo);

    await env.CACHE_KV.put(SITEMAP_KV_KEY, JSON.stringify(sitemap), {
      expirationTtl: 172800,
    });

    // Dispatch RefreshWorkflow to keep tracked repos fresh (2.5k budget)
    try {
      const refreshInstance = await env.REFRESH_WORKFLOW.create();
      console.log(`Cron: dispatched refresh-workflow: ${refreshInstance.id}`);
    } catch (err: any) {
      // May fail if an instance is already running — that's OK
      console.log(`Cron: refresh-workflow dispatch skipped: ${err.message}`);
    }

    // Daily snapshot — only on the daily trigger
    let snapshots: number | undefined;
    if (trigger === 'daily') {
      snapshots = await handleDailySnapshot(env);
    }

    return { trending, sitemap, snapshots };
  } catch (err: any) {
    console.error('Cron: aggregation failed:', err);
    return { trending: [], sitemap: [], error: err.message };
  }
}

/**
 * Read trending data from KV (populated by Queue consumer in real-time).
 */
export async function getTrending(kv: KVNamespace): Promise<TrendingRepo[]> {
  try {
    const data = await kv.get(TRENDING_KV_KEY, 'json') as TrendingRepo[] | null;
    return data ?? [];
  } catch {
    return [];
  }
}

/**
 * Read sitemap repos from KV.
 */
export async function getSitemapRepos(kv: KVNamespace): Promise<string[]> {
  try {
    const data = await kv.get(SITEMAP_KV_KEY, 'json') as string[] | null;
    return data ?? [];
  } catch {
    return [];
  }
}

/**
 * Daily snapshot handler — dispatches the IngestWorkflow.
 */
async function handleDailySnapshot(env: Env): Promise<number> {
  console.log('Cron (Daily): dispatching ingest workflow');

  const instance = await env.INGEST_WORKFLOW.create({
    params: { trigger: 'daily' as const },
  });

  console.log(`Cron (Daily): workflow instance created: ${instance.id}`);
  return 0;
}
