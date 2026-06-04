// ---------------------------------------------------------------------------
// Recent queries — D1-backed helpers for the landing page list
// ---------------------------------------------------------------------------

export interface RecentQuery {
  owner: string
  repo: string
  score: number
  verdict: string
  checkedAt: string
}

export { getRecentQueries, trackRecentQuery } from '../db/state'
