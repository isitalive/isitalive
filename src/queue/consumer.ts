// ---------------------------------------------------------------------------
// Queue consumer — simplified for Phase 3
//
// Only handles recent-queries (landing page UI).
// All other state (trending, tracked, first-seen, analytics, archives)
// is now handled by Pipelines → Iceberg → cron aggregation.
//
// Legacy message types are acknowledged but no longer processed.
// Kept during migration for backward compatibility — will be removed
// in Phase 4 when the queue binding is dropped entirely.
// ---------------------------------------------------------------------------

import type { Env } from '../scoring/types'
import type { QueueMessage, RecentQueryMessage } from './types'
import { getRecentQueries } from '../cache/recentQueries'

const RECENT_KV_KEY = 'isitalive:recent'
const MAX_RECENT = 10

/**
 * Queue consumer — processes batches of event messages.
 * Only processes recent-query messages; all others are acknowledged and skipped.
 */
export async function handleQueueBatch(
  batch: MessageBatch<QueueMessage>,
  env: Env,
): Promise<void> {
  const recentQueries: RecentQueryMessage[] = []

  for (const msg of batch.messages) {
    if (msg.body.type === 'recent-query') {
      recentQueries.push(msg.body)
    }
    // All other message types: acknowledged automatically by the batch handler.
    // Their data now flows through Pipelines → Iceberg instead.
  }

  if (recentQueries.length > 0) {
    await processRecentQueries(env, recentQueries)
  }
}

/**
 * Merge all recent query messages into the KV list with a single write.
 */
async function processRecentQueries(
  env: Env,
  messages: RecentQueryMessage[],
): Promise<void> {
  try {
    const existing = await getRecentQueries(env.CACHE_KV)

    let list = [...existing]
    for (const msg of messages) {
      const key = `${msg.data.owner}/${msg.data.repo}`.toLowerCase()
      list = list.filter(q => `${q.owner}/${q.repo}`.toLowerCase() !== key)
      list.unshift(msg.data)
    }

    list = list.slice(0, MAX_RECENT)
    await env.CACHE_KV.put(RECENT_KV_KEY, JSON.stringify(list))
  } catch (err) {
    console.error('Queue: failed to process recent queries:', err)
  }
}
