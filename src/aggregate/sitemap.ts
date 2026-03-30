// ---------------------------------------------------------------------------
// Aggregate: Sitemap — derive sitemap repo list from Iceberg, cache in KV
//
// Replaces the cron-maintained sitemap in cron/handler.ts.
// ---------------------------------------------------------------------------

import type { Env } from '../types/env'
import { queryR2SQL } from '../admin/r2sql'
import { SITEMAP_KEY } from '../state/keys'

const SITEMAP_SQL = `
SELECT project
FROM result_events_v2
WHERE timestamp > NOW() - INTERVAL '90 days'
  AND project != ''
GROUP BY project
ORDER BY COUNT(*) DESC
LIMIT 5000
`

/**
 * Query Iceberg for top repos by request count and cache as sitemap.
 * Called by the cron handler.
 */
export async function refreshSitemap(env: Env): Promise<string[]> {
  const result = await queryR2SQL(env, SITEMAP_SQL)

  if (result.error) {
    console.error('Aggregate: sitemap query failed:', result.error)
    return getSitemapRepos(env.CACHE_KV)
  }

  const repos: string[] = result.rows.map(row => String(row[0]))

  await env.CACHE_KV.put(SITEMAP_KEY, JSON.stringify(repos), {
    expirationTtl: 172800, // 2d safety net
  })

  return repos
}

/**
 * Read cached sitemap repos from KV.
 */
export async function getSitemapRepos(kv: KVNamespace): Promise<string[]> {
  try {
    const data = await kv.get(SITEMAP_KEY, 'json') as string[] | null
    return data ?? []
  } catch {
    return []
  }
}
