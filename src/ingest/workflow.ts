// ---------------------------------------------------------------------------
// Ingest Workflow — Cloudflare Workflows
//
// Durable, multi-step workflow that processes repos in individual steps.
// Each repo gets its own step with automatic retries, so a failure on
// repo #150 doesn't kill the entire run — it just retries that one step.
//
// Triggered by the cron handler via env.INGEST_WORKFLOW.create().
// ---------------------------------------------------------------------------

import {
  WorkflowEntrypoint,
  WorkflowStep,
} from 'cloudflare:workers';
import type { WorkflowEvent } from 'cloudflare:workers';

import type { Env } from '../scoring/types';
import { r2SqlSource } from './sources/r2-sql';
import { gitHubTrendingSource } from './sources/github';
import { snapshotRepo } from './processor';

type IngestParams = {
  trigger: 'daily' | 'hourly';
};

export class IngestWorkflow extends WorkflowEntrypoint<Env, IngestParams> {
  async run(event: WorkflowEvent<IngestParams>, step: WorkflowStep) {
    // Step 1: Gather repos from all configured ingest sources
    const repos = await step.do('gather-sources', async () => {
      const [r2Repos, ghRepos] = await Promise.all([
        r2SqlSource.getRepos(this.env),
        gitHubTrendingSource.getRepos(this.env),
      ]);

      // Deduplicate
      const all = [...new Set([...r2Repos, ...ghRepos])];
      console.log(`Workflow: gathered ${r2Repos.length} R2 + ${ghRepos.length} GitHub = ${all.length} unique repos`);
      return all;
    });

    if (repos.length === 0) {
      return { success: true, processed: 0, message: 'No repos to process' };
    }

    // Steps 2..N: Process each repo as its own durable step
    let successCount = 0;

    // Process in batches of 10 to limit concurrency per step
    const batchSize = 10;
    for (let i = 0; i < repos.length; i += batchSize) {
      const batch = repos.slice(i, i + batchSize);
      const batchIndex = Math.floor(i / batchSize) + 1;

      const results = await step.do(
        `batch-${batchIndex}`,
        {
          retries: {
            limit: 3,
            delay: '30 seconds',
            backoff: 'exponential',
          },
        },
        async () => {
          const outcomes = await Promise.allSettled(
            batch.map(repo => snapshotRepo(this.env, repo)),
          );

          return outcomes.map((r, idx) => ({
            repo: batch[idx],
            success: r.status === 'fulfilled' && r.value === true,
          }));
        },
      );

      for (const r of results) {
        if (r.success) successCount++;
      }

      // Brief pause between batches to respect GitHub rate limits
      if (i + batchSize < repos.length) {
        await step.sleep('rate-limit-pause', '2 seconds');
      }
    }

    return {
      success: true,
      processed: successCount,
      total: repos.length,
    };
  }
}
