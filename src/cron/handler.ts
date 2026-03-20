// ---------------------------------------------------------------------------
// Cron handler — periodic maintenance + daily snapshot
//
// Every 10 min: Refreshes the sitemap from R2 SQL. Trending data is now
//              computed in real-time by the Queue consumer — no polling needed.
//
// Daily (6AM UTC): Dispatches the IngestWorkflow to re-check top repos.
//
// R2 SQL = SQL engine over R2 Data Catalog (Iceberg tables).
// CF_R2_SQL_TOKEN must be scoped to: R2 Data Catalog + R2 Storage + R2 SQL → Read
// ---------------------------------------------------------------------------

import type { Env } from '../scoring/types';

const R2_SQL_ENDPOINT = 'https://api.sql.cloudflarestorage.com/api/v1/accounts';
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
    // Just read whatever is already in KV.
    const trending = await getTrending(env.CACHE_KV);

    // Sitemap still needs R2 SQL (all-time data, not just 24h)
    let sitemap: string[] = [];
    if (env.CF_ACCOUNT_ID && env.CF_R2_SQL_TOKEN) {
      sitemap = await querySitemapRepos(env);
      await env.CACHE_KV.put(SITEMAP_KV_KEY, JSON.stringify(sitemap), {
        expirationTtl: 172800,
      });
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
 * Query R2 SQL API for top 5000 repos for the sitemap.
 */
async function querySitemapRepos(env: Env): Promise<string[]> {
  const sql = `
    SELECT repo, count(*) as checkCount
    FROM default.checks
    GROUP BY repo
    ORDER BY count(*) DESC
    LIMIT 5000
  `;

  const bucketName = 'isitalive-data';
  const res = await fetch(
    `${R2_SQL_ENDPOINT}/${env.CF_ACCOUNT_ID}/r2-sql/query/${bucketName}`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.CF_R2_SQL_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: sql }),
    },
  );

  if (!res.ok) return [];

  const json = await res.json() as any;
  const rows = json.result?.rows ?? [];
  return rows.map((row: any) => row.repo as string);
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
