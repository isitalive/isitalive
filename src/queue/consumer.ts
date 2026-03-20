// ---------------------------------------------------------------------------
// Unified Event Queue — consumer
//
// Receives batches of typed messages and processes each group efficiently.
// A single KV write for recent queries, a single Pipeline call for analytics,
// individual KV writes for first-seen (idempotent), and R2 puts for archives.
// ---------------------------------------------------------------------------

import type { Env } from '../scoring/types';
import type { QueueMessage, RecentQueryMessage, CheckEventMessage, FirstSeenMessage, ArchiveRawMessage } from './types';
import { getRecentQueries } from '../cache/recentQueries';
import { sendCheckEvent, archiveRawData } from '../analytics/events';

const RECENT_KV_KEY = 'isitalive:recent';
const MAX_RECENT = 10;
const FIRST_SEEN_PREFIX = 'isitalive:first_seen:';

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
    }
  }

  // Process each group concurrently
  await Promise.all([
    processRecentQueries(env, recentQueries),
    processCheckEvents(env, checkEvents),
    processFirstSeen(env, firstSeenEvents),
    processArchives(env, archiveEvents),
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
    // Read existing list once
    const existing = await getRecentQueries(env.CACHE_KV);

    // Merge new entries (newest first), deduplicating by owner/repo
    let list = [...existing];
    for (const msg of messages) {
      const key = `${msg.data.owner}/${msg.data.repo}`.toLowerCase();
      list = list.filter(q => `${q.owner}/${q.repo}`.toLowerCase() !== key);
      list.unshift(msg.data);
    }

    // Cap at MAX_RECENT and write once
    list = list.slice(0, MAX_RECENT);
    await env.CACHE_KV.put(RECENT_KV_KEY, JSON.stringify(list));
  } catch (err) {
    console.error('Queue: failed to process recent queries:', err);
  }
}

/**
 * Forward all check events to the Pipeline in one call.
 */
async function processCheckEvents(
  env: Env,
  messages: CheckEventMessage[],
): Promise<void> {
  if (messages.length === 0) return;

  // Process each event through the existing sendCheckEvent function
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

  // Deduplicate by provider/owner/repo
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
