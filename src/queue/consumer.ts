// ---------------------------------------------------------------------------
// Unified Event Queue — consumer
//
// Receives batches of typed messages and processes each group efficiently.
// A single KV write for recent queries, a single Pipeline call for analytics,
// individual KV writes for first-seen (idempotent), R2 puts for archives,
// and real-time trending counter updates.
// ---------------------------------------------------------------------------

import type { Env } from '../scoring/types';
import type { QueueMessage, RecentQueryMessage, CheckEventMessage, FirstSeenMessage, ArchiveRawMessage, PageViewMessage } from './types';
import { getRecentQueries } from '../cache/recentQueries';
import { sendCheckEvent, archiveRawData } from '../analytics/events';

const RECENT_KV_KEY = 'isitalive:recent';
const MAX_RECENT = 10;
const FIRST_SEEN_PREFIX = 'isitalive:first_seen:';
const TRENDING_COUNTERS_KEY = 'isitalive:trending:counters';
const TRENDING_KV_KEY = 'isitalive:trending';
const MAX_TRENDING = 50;

/** Per-repo counter stored in KV */
export interface TrendingCounter {
  count: number;
  totalScore: number;
  lastVerdict: string;
  lastSeen: number; // epoch ms — used to expire entries older than 24h
}

/** Map of repo slug → counter */
export type TrendingCounters = Record<string, TrendingCounter>;

/**
 * Queue consumer — processes batches of event messages.
 */
export async function handleQueueBatch(
  batch: MessageBatch<QueueMessage>,
  env: Env,
): Promise<void> {
  // Group messages by type
  const recentQueries: RecentQueryMessage[] = [];
  const checkEvents: CheckEventMessage[] = [];
  const firstSeenEvents: FirstSeenMessage[] = [];
  const archiveEvents: ArchiveRawMessage[] = [];
  const pageViews: PageViewMessage[] = [];

  for (const msg of batch.messages) {
    switch (msg.body.type) {
      case 'recent-query':
        recentQueries.push(msg.body);
        break;
      case 'check-event':
        checkEvents.push(msg.body);
        break;
      case 'first-seen':
        firstSeenEvents.push(msg.body);
        break;
      case 'archive-raw':
        archiveEvents.push(msg.body);
        break;
      case 'page-view':
        pageViews.push(msg.body);
        break;
    }
  }

  // Process each group concurrently
  await Promise.all([
    processRecentQueries(env, recentQueries),
    processCheckEvents(env, checkEvents),
    processFirstSeen(env, firstSeenEvents),
    processArchives(env, archiveEvents),
    updateTrendingCounters(env, checkEvents, pageViews),
  ]);
}

/**
 * Merge all recent query messages into the KV list with a single write.
 */
async function processRecentQueries(
  env: Env,
  messages: RecentQueryMessage[],
): Promise<void> {
  if (messages.length === 0) return;

  try {
    const existing = await getRecentQueries(env.CACHE_KV);

    let list = [...existing];
    for (const msg of messages) {
      const key = `${msg.data.owner}/${msg.data.repo}`.toLowerCase();
      list = list.filter(q => `${q.owner}/${q.repo}`.toLowerCase() !== key);
      list.unshift(msg.data);
    }

    list = list.slice(0, MAX_RECENT);
    await env.CACHE_KV.put(RECENT_KV_KEY, JSON.stringify(list));
  } catch (err) {
    console.error('Queue: failed to process recent queries:', err);
  }
}

/**
 * Forward all check events to the Pipeline.
 */
async function processCheckEvents(
  env: Env,
  messages: CheckEventMessage[],
): Promise<void> {
  if (messages.length === 0) return;

  await Promise.allSettled(
    messages.map(msg => sendCheckEvent(env, msg.data.result, msg.data.ctx)),
  );
}

/**
 * Write first-seen timestamps — idempotent, only writes if key doesn't exist.
 */
async function processFirstSeen(
  env: Env,
  messages: FirstSeenMessage[],
): Promise<void> {
  if (messages.length === 0) return;

  const seen = new Map<string, FirstSeenMessage>();
  for (const msg of messages) {
    const key = `${msg.data.provider}/${msg.data.owner}/${msg.data.repo}`.toLowerCase();
    if (!seen.has(key)) seen.set(key, msg);
  }

  await Promise.allSettled(
    [...seen.values()].map(async (msg) => {
      const key = `${FIRST_SEEN_PREFIX}${msg.data.provider}/${msg.data.owner.toLowerCase()}/${msg.data.repo.toLowerCase()}`;
      const existing = await env.CACHE_KV.get(key);
      if (!existing) {
        await env.CACHE_KV.put(key, new Date().toISOString());
      }
    }),
  );
}

/**
 * Archive raw GitHub responses to R2.
 */
async function processArchives(
  env: Env,
  messages: ArchiveRawMessage[],
): Promise<void> {
  if (messages.length === 0) return;

  await Promise.allSettled(
    messages.map(msg =>
      archiveRawData(env, msg.data.provider, msg.data.owner, msg.data.repo, msg.data.rawResponse),
    ),
  );
}

/**
 * Update real-time trending counters from check events and page views.
 * Maintains a rolling 24h window of per-repo check counts and scores.
 * Also writes the sorted trending list directly to KV for the UI.
 */
async function updateTrendingCounters(
  env: Env,
  checkMessages: CheckEventMessage[],
  pageViewMessages: PageViewMessage[],
): Promise<void> {
  if (checkMessages.length === 0 && pageViewMessages.length === 0) return;

  try {
    // Read existing counters
    let counters: TrendingCounters = {};
    try {
      const existing = await env.CACHE_KV.get(TRENDING_COUNTERS_KEY, 'json') as TrendingCounters | null;
      counters = existing ?? {};
    } catch {}

    const now = Date.now();
    const cutoff = now - 24 * 3600 * 1000; // 24h ago

    // Expire entries older than 24h
    for (const [repo, counter] of Object.entries(counters)) {
      if (counter.lastSeen < cutoff) {
        delete counters[repo];
      }
    }

    // Increment counters from check events (have full scoring data)
    for (const msg of checkMessages) {
      const repo = msg.data.result.project.replace(/^[^/]+\//, ''); // strip provider prefix
      const existing = counters[repo];

      if (existing) {
        existing.count++;
        existing.totalScore += msg.data.result.score;
        existing.lastVerdict = msg.data.result.verdict;
        existing.lastSeen = now;
      } else {
        counters[repo] = {
          count: 1,
          totalScore: msg.data.result.score,
          lastVerdict: msg.data.result.verdict,
          lastSeen: now,
        };
      }
    }

    // Increment counters from page views (carry score/verdict from rendered page)
    for (const msg of pageViewMessages) {
      const repo = `${msg.data.owner}/${msg.data.repo}`.toLowerCase();
      const existing = counters[repo];

      if (existing) {
        existing.count++;
        existing.totalScore += msg.data.score;
        existing.lastVerdict = msg.data.verdict;
        existing.lastSeen = now;
      } else {
        counters[repo] = {
          count: 1,
          totalScore: msg.data.score,
          lastVerdict: msg.data.verdict,
          lastSeen: now,
        };
      }
    }

    // Write counters back to KV
    await env.CACHE_KV.put(TRENDING_COUNTERS_KEY, JSON.stringify(counters), {
      expirationTtl: 86400 * 2, // 2 day TTL as safety net
    });

    // Also compute and write the sorted trending list for the UI
    const trending = Object.entries(counters)
      .map(([repo, c]) => ({
        repo,
        checks: c.count,
        avgScore: Math.round(c.totalScore / c.count),
        lastVerdict: c.lastVerdict,
      }))
      .sort((a, b) => b.checks - a.checks)
      .slice(0, MAX_TRENDING);

    await env.CACHE_KV.put(TRENDING_KV_KEY, JSON.stringify(trending), {
      expirationTtl: 7200,
    });
  } catch (err) {
    console.error('Queue: failed to update trending counters:', err);
  }
}
