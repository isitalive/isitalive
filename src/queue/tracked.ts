// ---------------------------------------------------------------------------
// Tracked Repos Index — KV-backed registry of all repos we're monitoring.
//
// Maintained by the Queue consumer on every check-event and page-view.
// Read by the RefreshWorkflow to decide which repos to background-refresh.
// ---------------------------------------------------------------------------

export interface TrackedRepo {
  /** ISO timestamp — when data was last fetched from GitHub */
  lastChecked: string;
  /** ISO timestamp — when a user or API last viewed this repo */
  lastRequested: string;
  /** How this repo entered the system */
  source: 'user' | 'api' | 'trending' | 'ingest';
  /** Rolling request count (approximate — reset on prune) */
  requestCount: number;
}

export type TrackedIndex = Record<string, TrackedRepo>;

const TRACKED_KV_KEY = 'isitalive:tracked';

/**
 * Read the tracked repos index from KV.
 */
export async function getTrackedIndex(kv: KVNamespace): Promise<TrackedIndex> {
  try {
    const data = await kv.get(TRACKED_KV_KEY, 'json') as TrackedIndex | null;
    return data ?? {};
  } catch {
    return {};
  }
}

/**
 * Write the tracked repos index to KV.
 */
export async function putTrackedIndex(kv: KVNamespace, index: TrackedIndex): Promise<void> {
  await kv.put(TRACKED_KV_KEY, JSON.stringify(index), {
    // 120-day TTL as safety net — the index is actively maintained
    expirationTtl: 86400 * 120,
  });
}

/**
 * Upsert a repo into the tracked index.
 * Called from the queue consumer on every check-event / page-view.
 */
export function upsertTracked(
  index: TrackedIndex,
  repoSlug: string,
  source: TrackedRepo['source'],
  isCheck: boolean,
): void {
  const now = new Date().toISOString();
  const existing = index[repoSlug];

  if (existing) {
    existing.lastRequested = now;
    if (isCheck) existing.lastChecked = now;
    existing.requestCount++;
    // Upgrade source priority: user > api > trending > ingest
    const priority = ['ingest', 'trending', 'api', 'user'];
    if (priority.indexOf(source) > priority.indexOf(existing.source)) {
      existing.source = source;
    }
  } else {
    index[repoSlug] = {
      lastChecked: isCheck ? now : '',
      lastRequested: now,
      source,
      requestCount: 1,
    };
  }
}

/**
 * Prune repos not requested in >90 days.
 * Returns the number of repos pruned.
 */
export function pruneStale(index: TrackedIndex): number {
  const cutoff = new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString();
  let pruned = 0;

  for (const [repo, entry] of Object.entries(index)) {
    if (entry.lastRequested < cutoff) {
      delete index[repo];
      pruned++;
    }
  }

  return pruned;
}

/** Priority tiers for refresh scheduling */
export type RefreshTier = 'hot' | 'warm' | 'cold';

/**
 * Classify a tracked repo into a refresh tier.
 */
export function classifyTier(entry: TrackedRepo): RefreshTier {
  const now = Date.now();
  const lastReq = new Date(entry.lastRequested).getTime();
  const ageMs = now - lastReq;

  if (ageMs <= 7 * 24 * 3600 * 1000) return 'hot';
  if (ageMs <= 30 * 24 * 3600 * 1000) return 'warm';
  return 'cold';
}

/** Maximum staleness before a repo needs refreshing */
export const TIER_STALENESS: Record<RefreshTier, number> = {
  hot: 1 * 3600 * 1000,   // 1 hour
  warm: 6 * 3600 * 1000,  // 6 hours
  cold: 24 * 3600 * 1000, // 24 hours
};
