// ---------------------------------------------------------------------------
// Recent queries — thin helpers that talk to the RecentQueriesDO
// ---------------------------------------------------------------------------

export type { RecentQuery } from './recentQueriesDO';

/**
 * Read the recent queries list from the Durable Object.
 */
export async function getRecentQueries(
  doNamespace: DurableObjectNamespace,
): Promise<import('./recentQueriesDO').RecentQuery[]> {
  try {
    const id = doNamespace.idFromName('global');
    const stub = doNamespace.get(id);
    const res = await stub.fetch('https://do/recent', { method: 'GET' });
    return await res.json() as import('./recentQueriesDO').RecentQuery[];
  } catch {
    return [];
  }
}

/**
 * Add a query to the recent list via the Durable Object.
 */
export async function trackRecentQuery(
  doNamespace: DurableObjectNamespace,
  entry: import('./recentQueriesDO').RecentQuery,
): Promise<void> {
  try {
    const id = doNamespace.idFromName('global');
    const stub = doNamespace.get(id);
    await stub.fetch('https://do/recent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry),
    });
  } catch {
    // Non-critical — don't fail the request
  }
}
