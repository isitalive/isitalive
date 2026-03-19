// ---------------------------------------------------------------------------
// Recent Queries — Durable Object
//
// Single global DO that maintains a rolling list of the last 10 queried
// projects. Uses DO storage for strong consistency and single-writer
// semantics — no race conditions, no eventual consistency delays.
//
// API:
//   GET  /  → returns the current list as JSON
//   POST /  → adds a new entry (body: RecentQuery JSON)
// ---------------------------------------------------------------------------

export interface RecentQuery {
  owner: string;
  repo: string;
  score: number;
  verdict: string;
  checkedAt: string;
}

const MAX_ENTRIES = 10;
const STORAGE_KEY = 'recent';

export class RecentQueriesDO implements DurableObject {
  private state: DurableObjectState;
  private list: RecentQuery[] | null = null;

  constructor(state: DurableObjectState) {
    this.state = state;
  }

  private async load(): Promise<RecentQuery[]> {
    if (this.list !== null) return this.list;
    this.list = await this.state.storage.get<RecentQuery[]>(STORAGE_KEY) ?? [];
    return this.list;
  }

  async fetch(request: Request): Promise<Response> {
    if (request.method === 'GET') {
      const list = await this.load();
      return new Response(JSON.stringify(list), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (request.method === 'POST') {
      const entry = await request.json() as RecentQuery;
      const list = await this.load();

      // Deduplicate by owner/repo (case-insensitive)
      const key = `${entry.owner}/${entry.repo}`.toLowerCase();
      const filtered = list.filter(
        (q) => `${q.owner}/${q.repo}`.toLowerCase() !== key,
      );

      // Prepend and cap
      this.list = [entry, ...filtered].slice(0, MAX_ENTRIES);
      await this.state.storage.put(STORAGE_KEY, this.list);

      return new Response(null, { status: 204 });
    }

    return new Response('Method not allowed', { status: 405 });
  }
}
