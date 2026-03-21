// ---------------------------------------------------------------------------
// Cron handler — periodic aggregation + daily snapshot
//
// Every 10 min: Queries Iceberg for trending/tracked/sitemap, caches in KV,
//               and dispatches RefreshWorkflow to keep cache warm.
//
// Daily (6AM UTC): Dispatches the IngestWorkflow to re-check top repos.
// ---------------------------------------------------------------------------

import type { Env } from '../scoring/types'
import { refreshTrending, getTrending as getAggTrending } from '../aggregate/trending'
import { refreshTracked } from '../aggregate/tracked'
import { refreshSitemap, getSitemapRepos as getAggSitemapRepos } from '../aggregate/sitemap'
import type { TrendingRepo } from '../aggregate/trending'

// Re-export reads for consumer use (UI, sitemap route, etc.)
export { getAggTrending as getTrending, getAggSitemapRepos as getSitemapRepos }
export type { TrendingRepo }

/**
 * Scheduled (Cron) handler — routes to periodic or daily based on cron.
 */
export async function handleScheduled(env: Env, trigger?: string): Promise<{ trending: TrendingRepo[]; sitemap: string[]; snapshots?: number; error?: string }> {
  try {
    // Refresh materialized views from Iceberg → KV
    const [trending, , sitemap] = await Promise.all([
      refreshTrending(env),
      refreshTracked(env),
      refreshSitemap(env),
    ])

    // Dispatch RefreshWorkflow to keep tracked repos' score cache warm
    try {
      const refreshInstance = await env.REFRESH_WORKFLOW.create()
      console.log(`Cron: dispatched refresh-workflow: ${refreshInstance.id}`)
    } catch (err: any) {
      // May fail if an instance is already running — that's OK
      console.log(`Cron: refresh-workflow dispatch skipped: ${err.message}`)
    }

    // Daily snapshot — only on the daily trigger
    let snapshots: number | undefined
    if (trigger === 'daily') {
      snapshots = await handleDailySnapshot(env)
    }

    return { trending, sitemap: sitemap.slice(0, 100), snapshots }
  } catch (err: any) {
    console.error('Cron: aggregation failed:', err)
    return { trending: [], sitemap: [], error: err.message }
  }
}

/**
 * Daily snapshot handler — dispatches the IngestWorkflow.
 */
async function handleDailySnapshot(env: Env): Promise<number> {
  console.log('Cron (Daily): dispatching ingest workflow')

  const instance = await env.INGEST_WORKFLOW.create({
    params: { trigger: 'daily' as const },
  })

  console.log(`Cron (Daily): workflow instance created: ${instance.id}`)
  return 0
}
