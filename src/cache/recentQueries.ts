// ---------------------------------------------------------------------------
// Recent queries — rolling list of the last 10 checked projects
//
// Stored in KV as a simple JSON array. Updated non-blockingly via waitUntil.
// ---------------------------------------------------------------------------

const KV_KEY = 'isitalive:recent_queries';
const MAX_ENTRIES = 10;

export interface RecentQuery {
  owner: string;
  repo: string;
  score: number;
  verdict: string;
  checkedAt: string;
}

/**
 * Read the recent queries list from KV.
 * Returns an empty array if the key doesn't exist.
 */
export async function getRecentQueries(kv: KVNamespace): Promise<RecentQuery[]> {
  try {
    const data = await kv.get(KV_KEY, 'json') as RecentQuery[] | null;
    return data ?? [];
  } catch {
    return [];
  }
}

/**
 * Add a query to the front of the recent list.
 * Deduplicates by owner/repo (case-insensitive) and caps at MAX_ENTRIES.
 */
export async function trackRecentQuery(
  kv: KVNamespace,
  entry: RecentQuery,
): Promise<void> {
  const existing = await getRecentQueries(kv);

  // Deduplicate — remove any existing entry for same project
  const key = `${entry.owner}/${entry.repo}`.toLowerCase();
  const filtered = existing.filter(
    (q) => `${q.owner}/${q.repo}`.toLowerCase() !== key,
  );

  // Prepend new entry, cap at MAX_ENTRIES
  const updated = [entry, ...filtered].slice(0, MAX_ENTRIES);

  await kv.put(KV_KEY, JSON.stringify(updated));
}
