// ---------------------------------------------------------------------------
// Refresh Workflow — background freshness for tracked + discovered repos
//
// Runs periodically, reads user-tracked repos from D1 daily usage rollups plus
// externally discovered repos, and refreshes stale repos within a budget.
//
// Budget: 2,500 GitHub API calls per run (leaves 2,500 for live requests).
//
// The tracked index is derived from queue-consumed user/API usage events.
// The discovered index is populated by daily external-source ingest.
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
} from '../aggregate/tracked'
import { getDiscoveredIndex } from './discovered'
import { buildRefreshCandidates } from './refresh-plan'
import { CacheManager } from '../cache/index'

const BUDGET_PER_RUN = 2500
const BATCH_SIZE = 10

export class RefreshWorkflow extends WorkflowEntrypoint<Env, {}> {
  async run(_event: WorkflowEvent<{}>, step: WorkflowStep) {
    // Step 1: Read tracked/discovered indexes and plan refreshes.
    const plan = await step.do('plan-refresh', async () => {
      const [trackedIndex, discoveredIndex] = await Promise.all([
        getTrackedIndex(this.env),
        getDiscoveredIndex(this.env),
      ])
      const candidates = buildRefreshCandidates(trackedIndex, discoveredIndex)
      const totalTracked = Object.keys(trackedIndex).length
      const totalDiscovered = Object.keys(discoveredIndex).length

      if (candidates.length === 0) {
        console.log('Refresh: no tracked or discovered repos found yet')
        return { repos: [], totalTracked, totalDiscovered, totalStale: 0, selected: 0 }
      }

      const toRefresh: { repo: string; tier: string; reason: string; staleMs: number }[] = []
      const cacheManager = new CacheManager(this.env)

      for (const candidate of candidates) {
        const parts = candidate.repo.split('/')
        if (parts.length < 2) continue
        const [owner, repoName] = parts

        const cached = await cacheManager.getAny('github', owner, repoName)
        const lastCheckedMs = cached?.storedAt
          ? new Date(cached.storedAt).getTime()
          : 0 // never cached = infinitely stale
        const staleMs = Date.now() - lastCheckedMs

        if (staleMs > candidate.maxStalenessMs) {
          toRefresh.push({
            repo: candidate.repo,
            tier: candidate.tier,
            reason: candidate.reason,
            staleMs,
          })
        }
      }

      // Sort by staleness (most stale first), then cap at budget
      toRefresh.sort((a, b) => b.staleMs - a.staleMs)
      const selected = toRefresh.slice(0, BUDGET_PER_RUN)

      console.log(`Refresh: ${totalTracked} tracked + ${totalDiscovered} discovered, ${toRefresh.length} stale, selected ${selected.length} (budget: ${BUDGET_PER_RUN})`)

      return {
        repos: selected.map(r => r.repo),
        totalTracked,
        totalDiscovered,
        totalStale: toRefresh.length,
        selected: selected.length,
      }
    })

    if (plan.repos.length === 0) {
      return {
        success: true,
        message: 'All tracked and discovered repos are fresh',
        totalTracked: plan.totalTracked,
        totalDiscovered: plan.totalDiscovered,
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
      totalDiscovered: plan.totalDiscovered,
      totalStale: plan.totalStale,
      selected: plan.selected,
      refreshed: successCount,
    }
  }
}
