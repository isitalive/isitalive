import type { Env } from '../scoring/types';
import { GitHubProvider } from '../providers/github';
import { scoreProject } from '../scoring/engine';
import { sendCheckEvent, archiveRawData } from '../analytics/events';
import { putCache } from '../cache/index';

export interface ScoreSnapshot {
  date: string;     // YYYY-MM-DD
  score: number;    // 0-100
  verdict: string;  // e.g. "healthy"
}

const SCORE_HISTORY_MAX = 90;   // Keep ~90 days of history per repo
const github = new GitHubProvider();

/**
 * Process a list of repos in batches: fetch, score, cache, archive, and pipeline.
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

  try {
    const rawData = await github.fetchProject(owner, repo, env.GITHUB_TOKEN);
    const result = scoreProject(rawData, github.name);
    const today = new Date().toISOString().slice(0, 10);

    await Promise.all([
      putCache(env, 'github', owner, repo, result),
      archiveRawData(env, 'github', owner, repo, rawData._rawResponse),
      sendCheckEvent(env, result, {
        source: 'cron-daily',
        apiKey: 'system',
        cacheStatus: 'miss',
        responseTimeMs: 0,
        userAgent: 'isitalive-cron/1.0',
      }),
      appendScoreHistory(env.CACHE_KV, repoSlug, {
        date: today,
        score: result.score,
        verdict: result.verdict,
      }),
    ]);

    return true;
  } catch (err) {
    console.error(`Ingest Processor: failed to snapshot ${repoSlug}:`, err);
    return false;
  }
}

async function appendScoreHistory(
  kv: KVNamespace,
  repoSlug: string,
  snapshot: ScoreSnapshot,
): Promise<void> {
  const key = `isitalive:history:${repoSlug.toLowerCase()}`;

  let history: ScoreSnapshot[] = [];
  try {
    const existing = await kv.get(key, 'json') as ScoreSnapshot[] | null;
    history = existing ?? [];
  } catch {}

  history = history.filter(h => h.date !== snapshot.date);
  history.push(snapshot);
  
  if (history.length > SCORE_HISTORY_MAX) {
    history = history.slice(history.length - SCORE_HISTORY_MAX);
  }

  await kv.put(key, JSON.stringify(history), {
    expirationTtl: 86400 * 120, // Keep for 120 days
  });
}

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
