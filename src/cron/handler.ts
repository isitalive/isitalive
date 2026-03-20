// ---------------------------------------------------------------------------
// Cron handler — hourly trending + daily snapshot
//
// Hourly:  Queries R2 SQL API for top repos by check count in the last 24h,
//          writes the result to CACHE_KV for the /trending page to read.
//
// Daily:   Re-checks the top N most-queried repos, archives raw data to R2,
//          sends snapshot events to Pipeline, and stores score history in KV.
//          This builds a time-series dataset for trend analysis.
//
// R2 SQL = SQL engine over R2 Data Catalog (Iceberg tables).
// Queried via REST API — no native Worker binding for reads.
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
 * Scheduled (Cron) handler — routes to hourly or daily based on cron.
 */
export async function handleScheduled(env: Env, trigger?: string): Promise<{ trending: TrendingRepo[]; sitemap: string[]; snapshots?: number; error?: string }> {
  if (!env.CF_ACCOUNT_ID || !env.CF_R2_SQL_TOKEN) {
    return { trending: [], sitemap: [], error: 'CF_ACCOUNT_ID or CF_R2_SQL_TOKEN not set' };
  }

  try {
    // Always run trending (lightweight)
    const [trending, sitemap] = await Promise.all([
      queryTrending(env),
      querySitemapRepos(env),
    ]);

    await Promise.all([
      env.CACHE_KV.put(TRENDING_KV_KEY, JSON.stringify(trending), {
        expirationTtl: 7200,
      }),
      env.CACHE_KV.put(SITEMAP_KV_KEY, JSON.stringify(sitemap), {
        expirationTtl: 172800,
      }),
    ]);

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
 * Query R2 SQL API for top repos by check count.
 * Queries the Iceberg table populated by the Pipeline.
 */
async function queryTrending(env: Env): Promise<TrendingRepo[]> {
  const last24h = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const sql = `
    SELECT
      repo,
      count(*) as checkCount,
      avg(score) as avgScore,
      max(verdict) as maxVerdict
    FROM default.checks
    WHERE __ingest_ts > '${last24h}'
    GROUP BY repo
    ORDER BY count(*) DESC
    LIMIT 50
  `;

  // R2 SQL uses a different endpoint than WAE
  const bucketName = 'isitalive-data'; // The pipeline's R2 bucket
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

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`R2 SQL API error ${res.status}: ${body}`);
  }

  const json = await res.json() as any;
  const rows = json.result?.rows ?? [];
  return rows.map((row: any) => ({
    repo: row.repo,
    checks: Number(row.checkCount),
    avgScore: Math.round(Number(row.avgScore)),
    lastVerdict: row.maxVerdict ?? 'unknown',
  }));
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
 * Read trending data from KV (for the /trending page).
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
 * Daily snapshot handler — re-checks top N repos from the pipeline.
 * Returns the number of repos successfully snapshotted.
 */
async function handleDailySnapshot(env: Env): Promise<number> {
  console.log('Cron (Daily): dispatching ingest workflow');

  // Fire-and-forget — the Workflow runs asynchronously with durable steps
  const instance = await env.INGEST_WORKFLOW.create({
    params: { trigger: 'daily' as const },
  });

  console.log(`Cron (Daily): workflow instance created: ${instance.id}`);
  return 0; // Actual count tracked inside the Workflow
}
