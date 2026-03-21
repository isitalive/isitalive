// ---------------------------------------------------------------------------
// R2 SQL proxy — thin wrapper around the Cloudflare R2 SQL HTTP API
//
// Only allows read-only queries (SELECT). Proxies through the Worker
// so the CF_R2_SQL_TOKEN is never exposed to the browser.
// ---------------------------------------------------------------------------

import type { Env } from '../scoring/types'

export interface QueryResult {
  columns: string[]
  rows: any[][]
  rowCount: number
  timing: number // ms
  error?: string
}

/** SQL statements we refuse to proxy */
const BLOCKED_PATTERNS = [
  /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|REPLACE|MERGE)\b/i,
]

/**
 * Validate that a SQL query is read-only.
 */
export function validateReadOnly(sql: string): string | null {
  const trimmed = sql.trim()

  if (!trimmed) {
    return 'Query cannot be empty'
  }

  // Must start with SELECT or WITH (CTEs)
  if (!/^\s*(SELECT|WITH)\b/i.test(trimmed)) {
    return 'Only SELECT queries are allowed'
  }

  // Strip string literals before checking for blocked patterns —
  // keywords inside quotes (e.g. LIKE '%DROP%') are safe.
  const withoutStrings = trimmed.replace(/'[^']*'/g, '').replace(/"[^"]*"/g, '')

  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(withoutStrings)) {
      return `Query contains a blocked statement: ${withoutStrings.match(pattern)?.[0]}`
    }
  }

  // Reject multiple statements (semicolon followed by more SQL)
  if (withoutStrings.includes(';') && withoutStrings.indexOf(';') < withoutStrings.length - 1) {
    return 'Multiple statements are not allowed'
  }

  return null // valid
}

/**
 * Execute a read-only SQL query against R2 SQL API.
 */
export async function queryR2SQL(env: Env, sql: string): Promise<QueryResult> {
  const start = Date.now()

  // Validate
  const error = validateReadOnly(sql)
  if (error) {
    return { columns: [], rows: [], rowCount: 0, timing: 0, error }
  }

  const accountId = env.CF_ACCOUNT_ID
  const token = env.CF_R2_SQL_TOKEN
  const warehouse = env.CF_R2_WAREHOUSE

  if (!accountId || !token || !warehouse) {
    return {
      columns: [],
      rows: [],
      rowCount: 0,
      timing: Date.now() - start,
      error: 'R2 SQL is not configured. Set CF_ACCOUNT_ID, CF_R2_SQL_TOKEN, and CF_R2_WAREHOUSE in Worker secrets.',
    }
  }

  try {
    const response = await fetch(
      `https://api.sql.cloudflarestorage.com/api/v1/accounts/${accountId}/r2-sql/query/${warehouse}`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: sql }),
      },
    )

    if (!response.ok) {
      const text = await response.text()
      return {
        columns: [],
        rows: [],
        rowCount: 0,
        timing: Date.now() - start,
        error: `R2 SQL API error (${response.status}): ${text.slice(0, 200)}`,
      }
    }

    const data = await response.json() as any

    // R2 SQL returns { success, result: { columns, data } } or similar
    // Adapt to our QueryResult shape
    if (!data.success) {
      const errors = data.errors?.map((e: any) => e.message).join(', ') || 'Unknown error'
      return { columns: [], rows: [], rowCount: 0, timing: Date.now() - start, error: errors }
    }

    // Parse the result — R2 SQL returns results as array of objects
    const results = data.result ?? []
    if (!Array.isArray(results) || results.length === 0) {
      return { columns: [], rows: [], rowCount: 0, timing: Date.now() - start }
    }

    // If result is an array of arrays with a schema
    // Handle both formats: array of objects or { columns, data }
    let columns: string[] = []
    let rows: any[][] = []

    if (Array.isArray(results) && results.length > 0) {
      if (typeof results[0] === 'object' && !Array.isArray(results[0])) {
        // Array of objects — most common
        columns = Object.keys(results[0])
        rows = results.map((row: any) => columns.map(col => row[col]))
      } else {
        // Already array of arrays — use first row as header
        columns = results[0] as string[]
        rows = results.slice(1) as any[][]
      }
    }

    return {
      columns,
      rows,
      rowCount: rows.length,
      timing: Date.now() - start,
    }
  } catch (err: any) {
    return {
      columns: [],
      rows: [],
      rowCount: 0,
      timing: Date.now() - start,
      error: `Failed to query R2 SQL: ${err.message}`,
    }
  }
}

// ---------------------------------------------------------------------------
// Preset queries for the admin query console
// ---------------------------------------------------------------------------

export interface PresetQuery {
  label: string
  sql: string
  chart: 'line' | 'bar' | 'hbar' | 'donut'
}

export const PRESET_QUERIES: PresetQuery[] = [
  {
    label: 'Daily Volume (30d)',
    sql: `SELECT DATE(timestamp) as day, COUNT(*) as checks\nFROM analytics\nGROUP BY day\nORDER BY day\nLIMIT 30`,
    chart: 'line',
  },
  {
    label: 'Verdict Distribution',
    sql: `SELECT verdict, COUNT(*) as count\nFROM analytics\nGROUP BY verdict\nORDER BY count DESC`,
    chart: 'donut',
  },
  {
    label: 'Top 20 Repos',
    sql: `SELECT repo, COUNT(*) as checks\nFROM analytics\nGROUP BY repo\nORDER BY checks DESC\nLIMIT 20`,
    chart: 'hbar',
  },
  {
    label: 'Hourly Traffic',
    sql: `SELECT HOUR(timestamp) as hour, COUNT(*) as requests\nFROM analytics\nGROUP BY hour\nORDER BY hour`,
    chart: 'line',
  },
  {
    label: 'Top API Consumers',
    sql: `SELECT api_key, COUNT(*) as requests\nFROM analytics\nWHERE api_key != 'anon'\nGROUP BY api_key\nORDER BY requests DESC\nLIMIT 10`,
    chart: 'bar',
  },
  {
    label: 'Geo Distribution',
    sql: `SELECT country, COUNT(*) as requests\nFROM analytics\nGROUP BY country\nORDER BY requests DESC\nLIMIT 20`,
    chart: 'bar',
  },
  {
    label: 'Cache Hit Ratio',
    sql: `SELECT cache_status, COUNT(*) as count\nFROM analytics\nGROUP BY cache_status`,
    chart: 'donut',
  },
  {
    label: 'Client Types',
    sql: `SELECT client_type, COUNT(*) as count\nFROM analytics\nGROUP BY client_type`,
    chart: 'donut',
  },
]
