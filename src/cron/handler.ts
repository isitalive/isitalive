// ---------------------------------------------------------------------------
// Cron handler — hourly trending aggregation
//
// Queries R2 SQL API for top repos by check count in the last 24h,
// writes the result to CACHE_KV for the /trending page to read.
//
// R2 SQL = SQL engine over R2 Data Catalog (Iceberg tables).
// Queried via REST API — no native Worker binding for reads.
// CF_R2_SQL_TOKEN must be scoped to: R2 Data Catalog + R2 Storage + R2 SQL → Read
// ---------------------------------------------------------------------------

import type { Env } from '../scoring/types';

const R2_SQL_ENDPOINT = 'https://api.sql.cloudflarestorage.com/api/v1/accounts';
const TRENDING_KV_KEY = 'isitalive:trending';

export interface TrendingRepo {
  repo: string;       // "owner/repo"
  checks: number;     // check count in last 24h
  avgScore: number;   // average score
  lastVerdict: string; // most recent verdict
}

/**
 * Scheduled (Cron) handler — runs hourly.
 */
export async function handleScheduled(env: Env): Promise<void> {
  if (!env.CF_ACCOUNT_ID || !env.CF_R2_SQL_TOKEN) {
    console.log('Cron: skipping — CF_ACCOUNT_ID or CF_R2_SQL_TOKEN not set');
    return;
  }

  try {
    const trending = await queryTrending(env);
    await env.CACHE_KV.put(TRENDING_KV_KEY, JSON.stringify(trending), {
      expirationTtl: 7200, // 2h TTL as safety net (Cron refreshes hourly)
    });
    console.log(`Cron: updated trending — ${trending.length} repos`);
  } catch (err) {
    console.error('Cron: trending aggregation failed:', err);
  }
}

/**
 * Query R2 SQL API for top repos by check count.
 * Queries the Iceberg table populated by the Pipeline.
 */
async function queryTrending(env: Env): Promise<TrendingRepo[]> {
  const sql = `
    SELECT
      repo,
      count(*) as checks,
      avg(score) as avg_score,
      max(verdict) as last_verdict
    FROM default.checks
    WHERE __ingest_ts > NOW() - INTERVAL '24' HOUR
    GROUP BY repo
    ORDER BY checks DESC
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
  const rows = json.data ?? [];

  return rows.map((row: any) => ({
    repo: row.repo,
    checks: Number(row.checks),
    avgScore: Math.round(Number(row.avg_score)),
    lastVerdict: row.last_verdict ?? 'unknown',
  }));
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
