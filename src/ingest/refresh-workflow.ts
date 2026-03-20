// ---------------------------------------------------------------------------
// Refresh Workflow — background freshness for tracked repos
//
// Runs periodically, reads the tracked repos index from KV, and refreshes
// stale repos within a configurable budget. Uses priority tiers:
//   Hot  (requested in last 7d)  → refresh if data >1h old
//   Warm (requested in last 30d) → refresh if data >6h old
//   Cold (requested 30–90d ago)  → refresh if data >24h old
//
// Budget: 2,500 GitHub API calls per run (leaves 2,500 for live requests).
// ---------------------------------------------------------------------------

import {
  WorkflowEntrypoint,
  WorkflowStep,
} from 'cloudflare:workers';
import type { WorkflowEvent } from 'cloudflare:workers';

import type { Env } from '../scoring/types';
import { snapshotRepo } from './processor';
import {
  getTrackedIndex,
  putTrackedIndex,
  pruneStale,
  classifyTier,
  TIER_STALENESS,
  type TrackedIndex,
} from '../queue/tracked';

const BUDGET_PER_RUN = 2500;
const BATCH_SIZE = 10;

export class RefreshWorkflow extends WorkflowEntrypoint<Env, {}> {
  async run(_event: WorkflowEvent<{}>, step: WorkflowStep) {
    // Step 1: Read tracked index and select repos to refresh
    const plan = await step.do('plan-refresh', async () => {
      const index = await getTrackedIndex(this.env.CACHE_KV);

      // Prune repos not requested in >90 days
      const pruned = pruneStale(index);
      if (pruned > 0) {
        console.log(`Refresh: pruned ${pruned} stale repos (>90d)`);
        await putTrackedIndex(this.env.CACHE_KV, index);
      }

      const totalTracked = Object.keys(index).length;
      console.log(`Refresh: ${totalTracked} tracked repos after pruning`);

      // Find repos that need refreshing based on their tier staleness
      const now = Date.now();
      const toRefresh: { repo: string; tier: string; staleMs: number }[] = [];

      for (const [repo, entry] of Object.entries(index)) {
        const tier = classifyTier(entry);
        const maxStaleness = TIER_STALENESS[tier];

        // How stale is the data?
        const lastChecked = entry.lastChecked
          ? new Date(entry.lastChecked).getTime()
          : 0; // never checked = infinitely stale
        const staleMs = now - lastChecked;

        if (staleMs > maxStaleness) {
          toRefresh.push({ repo, tier, staleMs });
        }
      }

      // Sort by staleness (most stale first), then cap at budget
      toRefresh.sort((a, b) => b.staleMs - a.staleMs);
      const selected = toRefresh.slice(0, BUDGET_PER_RUN);

      console.log(`Refresh: ${toRefresh.length} repos stale, selected ${selected.length} (budget: ${BUDGET_PER_RUN})`);

      return {
        repos: selected.map(r => r.repo),
        totalTracked,
        totalStale: toRefresh.length,
        selected: selected.length,
      };
    });

    if (plan.repos.length === 0) {
      return {
        success: true,
        message: 'All tracked repos are fresh',
        totalTracked: plan.totalTracked,
        refreshed: 0,
      };
    }

    // Steps 2..N: Refresh repos in batches
    let successCount = 0;

    for (let i = 0; i < plan.repos.length; i += BATCH_SIZE) {
      const batch = plan.repos.slice(i, i + BATCH_SIZE);
      const batchIndex = Math.floor(i / BATCH_SIZE) + 1;

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
          );

          // Update lastChecked in the tracked index for successful refreshes
          const index = await getTrackedIndex(this.env.CACHE_KV);
          const now = new Date().toISOString();
          for (let j = 0; j < outcomes.length; j++) {
            if (outcomes[j].status === 'fulfilled' && (outcomes[j] as PromiseFulfilledResult<boolean>).value) {
              const entry = index[batch[j]];
              if (entry) entry.lastChecked = now;
            }
          }
          await putTrackedIndex(this.env.CACHE_KV, index);

          return outcomes.map((r, idx) => ({
            repo: batch[idx],
            success: r.status === 'fulfilled' && (r as PromiseFulfilledResult<boolean>).value === true,
          }));
        },
      );

      for (const r of results) {
        if (r.success) successCount++;
      }

      // Brief pause between batches to smooth GitHub API usage
      if (i + BATCH_SIZE < plan.repos.length) {
        await step.sleep(`rate-limit-${batchIndex}`, '1 second');
      }
    }

    return {
      success: true,
      totalTracked: plan.totalTracked,
      totalStale: plan.totalStale,
      selected: plan.selected,
      refreshed: successCount,
    };
  }
}
