// ---------------------------------------------------------------------------
// Shared provider registry + background revalidation helper
//
// Single source of truth for provider instances — avoids creating
// separate GitHubProvider objects across routes, audit scorer, and cron.
// ---------------------------------------------------------------------------

import type { Env } from '../scoring/types';
import { GitHubProvider } from './github';
import { scoreProject } from '../scoring/engine';
import { putCache } from '../cache/index';

export const providers = {
  github: new GitHubProvider(),
} as const;

export type SupportedProvider = keyof typeof providers;

/**
 * Get a provider by name, throwing if unsupported.
 */
export function getProvider(name: string): (typeof providers)[SupportedProvider] {
  if (!Object.hasOwn(providers, name)) {
    throw new Error(`Unsupported provider: ${name}. Supported: ${Object.keys(providers).join(', ')}`);
  }
  return providers[name as SupportedProvider];
}

/**
 * Background revalidation — fetches fresh data, scores it, and updates cache.
 * Used by check, badge, and UI routes for stale-while-revalidate.
 *
 * Archives the raw response via the Provider Pipeline.
 */
export async function revalidateInBackground(
  env: Env,
  provider: string,
  owner: string,
  repo: string,
): Promise<void> {
  try {
    const prov = getProvider(provider)
    const rawData = await prov.fetchProject(owner, repo, env.GITHUB_TOKEN)
    const result = scoreProject(rawData, prov.name)
    await putCache(env, provider, owner, repo, result)
    // Archive raw data via Pipeline
    const { buildProviderEvent } = await import('../events/provider')
    const { buildResultEvent } = await import('../events/result')
    const { emitAll } = await import('../pipeline/emit')
    await emitAll(env, {
      provider: [buildProviderEvent(provider as any, owner, repo, rawData._rawResponse)],
      result: [buildResultEvent(result, 'revalidation')],
    })
  } catch {
    // Silently fail — stale data is still being served
  }
}

