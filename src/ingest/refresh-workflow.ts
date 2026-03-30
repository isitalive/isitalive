// ---------------------------------------------------------------------------
// Refresh Workflow — background freshness for tracked repos
//
// Runs periodically, reads the tracked repos index from Iceberg-cached KV,
// and refreshes stale repos within a configurable budget. Uses priority tiers:
//   Hot  (requested in last 7d)  → refresh if data >1h old
//   Warm (requested in last 30d) → refresh if data >6h old
//   Cold (requested 30–90d ago)  → refresh if data >24h old
//
// Budget: 2,500 GitHub API calls per run (leaves 2,500 for live requests).
//
// The tracked index is now derived from Iceberg (usage_events) and cached
// in KV by the cron handler. This workflow only reads it, never writes.
// ---------------------------------------------------------------------------

import {
  WorkflowEntrypoint,
  WorkflowStep,
} from 'cloudflare:workers'
import type { WorkflowEvent } from 'cloudflare:workers'

import type { Env } from '../types/env'
import { snapshotRepo } from './processor'
import {
  getTrackedIndex,
  TIER_STALENESS,
  type TrackedIndex,
} from '../aggregate/tracked'
import { CacheManager } from '../cache/index'

const BUDGET_PER_RUN = 2500
const BATCH_SIZE = 10

export class RefreshWorkflow extends WorkflowEntrypoint<Env, {}> {
  async run(_event: WorkflowEvent<{}>, step: WorkflowStep) {
    // Step 1: Read tracked index (populated by cron from Iceberg) and plan
    const plan = await step.do('plan-refresh', async () => {
      const index = await getTrackedIndex(this.env.CACHE_KV)
      const totalTracked = Object.keys(index).length

      if (totalTracked === 0) {
        console.log('Refresh: no tracked repos found (Iceberg index may not be populated yet)')
        return { repos: [], totalTracked: 0, totalStale: 0, selected: 0 }
      }

      // Find repos that need refreshing based on their tier staleness
      const toRefresh: { repo: string; tier: string; staleMs: number }[] = []
      const cacheManager = new CacheManager(this.env)

      for (const [repo, entry] of Object.entries(index)) {
        const maxStaleness = TIER_STALENESS[entry.tier]

        // Check how old the cached score is
        const parts = repo.split('/')
        if (parts.length < 2) continue
        const [owner, repoName] = parts

        // Use the cached result's storedAt timestamp to determine staleness
        const cached = await cacheManager.get('github', owner, repoName)
        const lastCheckedMs = cached.storedAt
          ? new Date(cached.storedAt).getTime()
          : 0 // never cached = infinitely stale
        const staleMs = Date.now() - lastCheckedMs

        if (staleMs > maxStaleness) {
          toRefresh.push({ repo, tier: entry.tier, staleMs })
        }
      }

      // Sort by staleness (most stale first), then cap at budget
      toRefresh.sort((a, b) => b.staleMs - a.staleMs)
      const selected = toRefresh.slice(0, BUDGET_PER_RUN)

      console.log(`Refresh: ${totalTracked} tracked, ${toRefresh.length} stale, selected ${selected.length} (budget: ${BUDGET_PER_RUN})`)

      return {
        repos: selected.map(r => r.repo),
        totalTracked,
        totalStale: toRefresh.length,
        selected: selected.length,
      }
    })

    if (plan.repos.length === 0) {
      return {
        success: true,
        message: 'All tracked repos are fresh',
        totalTracked: plan.totalTracked,
        refreshed: 0,
      }
    }

    // Steps 2..N: Refresh repos in batches
    let successCount = 0

    for (let i = 0; i < plan.repos.length; i += BATCH_SIZE) {
      const batch = plan.repos.slice(i, i + BATCH_SIZE)
      const batchIndex = Math.floor(i / BATCH_SIZE) + 1

      const results = await step.do(
        `refresh-batch-${batchIndex}`,
        {
          retries: {
            limit: 2,
            delay: '10 seconds',
            backoff: 'exponential',
          },
        },
        async () => {
          const outcomes = await Promise.allSettled(
            batch.map(repo => snapshotRepo(this.env, repo)),
          )

          return outcomes.map((r, idx) => ({
            repo: batch[idx],
            success: r.status === 'fulfilled' && (r as PromiseFulfilledResult<boolean>).value === true,
          }))
        },
      )

      for (const r of results) {
        if (r.success) successCount++
      }

      // Brief pause between batches to smooth GitHub API usage
      if (i + BATCH_SIZE < plan.repos.length) {
        await step.sleep(`rate-limit-${batchIndex}`, '1 second')
      }
    }

    return {
      success: true,
      totalTracked: plan.totalTracked,
      totalStale: plan.totalStale,
      selected: plan.selected,
      refreshed: successCount,
    }
  }
}
