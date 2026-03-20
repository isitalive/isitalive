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
import { GitHubProvider } from '../providers/github';
import { scoreProject } from '../scoring/engine';
import { sendCheckEvent, archiveRawData, type CheckEventContext } from '../analytics/events';
import { putCache } from '../cache/index';

const R2_SQL_ENDPOINT = 'https://api.sql.cloudflarestorage.com/api/v1/accounts';
const TRENDING_KV_KEY = 'isitalive:trending';
const SITEMAP_KV_KEY = 'isitalive:sitemap_repos';
const SNAPSHOT_MAX_REPOS = 200;  // Max repos to re-check daily
const SCORE_HISTORY_MAX = 90;   // Keep ~90 days of history per repo

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

// ---------------------------------------------------------------------------
// Daily Snapshot — re-check top repos and build score history
// ---------------------------------------------------------------------------

/** A single point in a repo's score time-series */
export interface ScoreSnapshot {
  date: string;     // YYYY-MM-DD
  score: number;    // 0-100
  verdict: string;  // e.g. "healthy"
}

const github = new GitHubProvider();

/**
 * Daily snapshot handler — re-checks top N repos from the pipeline.
 * Returns the number of repos successfully snapshotted.
 */
async function handleDailySnapshot(env: Env): Promise<number> {
  console.log('Cron (Daily): starting snapshot run');

  // 1. Get the most-queried repos from the Pipeline data
  const repos = await queryTopRepos(env);
  console.log(`Cron (Daily): found ${repos.length} repos to snapshot`);

  if (repos.length === 0) return 0;

  // 2. Process in batches of 10 (concurrency limit to avoid GitHub rate limits)
  let successCount = 0;
  const batchSize = 10;

  for (let i = 0; i < repos.length; i += batchSize) {
    const batch = repos.slice(i, i + batchSize);
    const results = await Promise.allSettled(
      batch.map(repo => snapshotRepo(env, repo)),
    );

    for (const r of results) {
      if (r.status === 'fulfilled' && r.value) successCount++;
    }

    // Small delay between batches to be kind to GitHub API
    if (i + batchSize < repos.length) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  console.log(`Cron (Daily): snapshotted ${successCount}/${repos.length} repos`);
  return successCount;
}

/**
 * Query R2 SQL for the most-queried repos (all-time) for snapshot.
 */
async function queryTopRepos(env: Env): Promise<string[]> {
  const sql = `
    SELECT repo, count(*) as checkCount
    FROM default.checks
    GROUP BY repo
    ORDER BY count(*) DESC
    LIMIT ${SNAPSHOT_MAX_REPOS}
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

  if (!res.ok) {
    console.error(`Cron (Daily): R2 SQL error ${res.status}`);
    return [];
  }

  const json = await res.json() as any;
  const rows = json.result?.rows ?? [];
  return rows.map((row: any) => row.repo as string);
}

/**
 * Snapshot a single repo: fetch, score, archive, update history.
 */
async function snapshotRepo(env: Env, repoSlug: string): Promise<boolean> {
  const parts = repoSlug.split('/');
  if (parts.length < 2) return false;
  const [owner, repo] = parts;

  try {
    // Fetch fresh data from GitHub
    const rawData = await github.fetchProject(owner, repo, env.GITHUB_TOKEN);
    const result = scoreProject(rawData, github.name);
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

    // Fire-and-forget: cache result, archive raw data, send pipeline event
    await Promise.all([
      // Update the cache so users get fresh data
      putCache(env, 'github', owner, repo, result),

      // Archive raw GitHub JSON to R2
      archiveRawData(env, 'github', owner, repo, rawData._rawResponse),

      // Send snapshot event to Pipeline (Iceberg)
      sendCheckEvent(env, result, {
        source: 'cron-daily',
        apiKey: 'system',
        cacheStatus: 'miss',
        responseTimeMs: 0,
        userAgent: 'isitalive-cron/1.0',
      }),

      // Append to per-repo score history in KV
      appendScoreHistory(env.CACHE_KV, repoSlug, {
        date: today,
        score: result.score,
        verdict: result.verdict,
      }),
    ]);

    return true;
  } catch (err) {
    console.error(`Cron (Daily): failed to snapshot ${repoSlug}:`, err);
    return false;
  }
}

/**
 * Append a score snapshot to the repo's history in KV.
 * Keeps the last SCORE_HISTORY_MAX entries (rolling window).
 */
async function appendScoreHistory(
  kv: KVNamespace,
  repoSlug: string,
  snapshot: ScoreSnapshot,
): Promise<void> {
  const key = `isitalive:history:${repoSlug.toLowerCase()}`;

  // Read existing history
  let history: ScoreSnapshot[] = [];
  try {
    const existing = await kv.get(key, 'json') as ScoreSnapshot[] | null;
    history = existing ?? [];
  } catch {}

  // Deduplicate by date (only one entry per day)
  history = history.filter(h => h.date !== snapshot.date);

  // Append new snapshot and trim to max
  history.push(snapshot);
  if (history.length > SCORE_HISTORY_MAX) {
    history = history.slice(history.length - SCORE_HISTORY_MAX);
  }

  await kv.put(key, JSON.stringify(history), {
    expirationTtl: 86400 * 120, // Keep for 120 days
  });
}

/**
 * Read score history for a repo from KV.
 */
export async function getScoreHistory(
  kv: KVNamespace,
  owner: string,
  repo: string,
): Promise<ScoreSnapshot[]> {
  const key = `isitalive:history:${owner.toLowerCase()}/${repo.toLowerCase()}`;
  try {
    const data = await kv.get(key, 'json') as ScoreSnapshot[] | null;
    return data ?? [];
  } catch {
    return [];
  }
}
