// ---------------------------------------------------------------------------
// Recent queries — thin helpers that talk to the RecentQueriesDO
// ---------------------------------------------------------------------------

export interface RecentQuery {
  owner: string;
  repo: string;
  score: number;
  verdict: string;
  checkedAt: string;
}

const RECENT_KV_KEY = 'isitalive:recent';
const MAX_ENTRIES = 10;

/**
 * Read the recent queries list from KV.
 */
export async function getRecentQueries(
  kv: KVNamespace,
): Promise<RecentQuery[]> {
  try {
    const list = await kv.get(RECENT_KV_KEY, 'json') as RecentQuery[] | null;
    return list ?? [];
  } catch {
    return [];
  }
}

/**
 * Add a query to the recent list via KV.
 */
export async function trackRecentQuery(
  kv: KVNamespace,
  entry: RecentQuery,
): Promise<void> {
  try {
    const list = await getRecentQueries(kv);

    // Deduplicate by owner/repo (case-insensitive)
    const key = `${entry.owner}/${entry.repo}`.toLowerCase();
    const filtered = list.filter(
      (q) => `${q.owner}/${q.repo}`.toLowerCase() !== key,
    );

    // Prepend and cap
    const updatedList = [entry, ...filtered].slice(0, MAX_ENTRIES);
    
    // Write back to KV (eventually consistent, acceptable for this vanity UI list)
    await kv.put(RECENT_KV_KEY, JSON.stringify(updatedList));
  } catch {
    // Non-critical — don't fail the request
  }
}
