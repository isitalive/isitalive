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
import type { QueueMessage } from '../queue/types';

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
 * Optionally archives the raw response via the event queue.
 */
export async function revalidateInBackground(
  env: Env,
  provider: string,
  owner: string,
  repo: string,
  queue?: Queue<QueueMessage>,
): Promise<void> {
  try {
    const prov = getProvider(provider);
    const rawData = await prov.fetchProject(owner, repo, env.GITHUB_TOKEN);
    const result = scoreProject(rawData, prov.name);
    await putCache(env, provider, owner, repo, result);
    // Archive raw data via queue if provided
    if (queue) {
      await queue.send({
        type: 'archive-raw',
        data: { provider, owner, repo, rawResponse: rawData._rawResponse },
      } satisfies QueueMessage);
    }
  } catch {
    // Silently fail — stale data is still being served
  }
}
