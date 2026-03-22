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

  // Check blocked keywords BEFORE stripping comments — defense-in-depth:
  // blocked keywords hidden inside comments (e.g. /* DROP TABLE */) are
  // still rejected because we don't trust arbitrary content being proxied.
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(withoutStrings)) {
      return `Query contains a blocked statement: ${withoutStrings.match(pattern)?.[0]}`
    }
  }

  // Strip comments for the multi-statement check — semicolons inside
  // comments (e.g. `-- comment with ;`) should not trigger rejection.
  const withoutComments = withoutStrings
    .replace(/\/\*[\s\S]*?\*\//g, '')   // block comments /* ... */
    .replace(/--[^\n]*/g, '')           // line comments -- ...

  // Reject multiple statements (semicolon followed by more SQL)
  if (withoutComments.includes(';') && withoutComments.indexOf(';') < withoutComments.length - 1) {
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

  // Auto-limit queries that don't already specify a LIMIT to prevent
  // unbounded result sets from exhausting Worker memory.
  // Strip strings, comments, and blocked patterns before checking for LIMIT
  // to prevent bypass via 'LIMIT' inside a string literal or comment.
  const limitCheckSql = sql
    .replace(/'[^']*'/g, '')           // strip single-quoted strings
    .replace(/"[^"]*"/g, '')           // strip double-quoted strings
    .replace(/\/\*[\s\S]*?\*\//g, '')  // strip block comments
    .replace(/--[^\n]*/g, '')          // strip line comments

  if (!/\bLIMIT\b/i.test(limitCheckSql)) {
    // Remove trailing line comments and semicolon/whitespace so that
    // the appended LIMIT cannot end up inside a comment.
    sql = sql
      .replace(/--[^\n]*$/gm, '')      // drop trailing line comments
      .replace(/\s*;?\s*$/, '')         // drop trailing semicolon/whitespace

    sql = sql + '\nLIMIT 1000'
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

    // R2 SQL API returns { success, result: { schema, rows, metrics }, errors, messages }
    if (!data.success) {
      const errors = data.errors?.map((e: any) => e.message).join(', ') || 'Unknown error'
      return { columns: [], rows: [], rowCount: 0, timing: Date.now() - start, error: errors }
    }

    const result = data.result
    if (!result || !Array.isArray(result.rows) || result.rows.length === 0) {
      return { columns: [], rows: [], rowCount: 0, timing: Date.now() - start }
    }

    // Extract column names from schema or fall back to row keys
    const columns: string[] = Array.isArray(result.schema)
      ? result.schema.map((col: any) => col.name)
      : Object.keys(result.rows[0])

    // Rows are objects — convert to arrays matching column order
    const rows = result.rows.map((row: any) => columns.map(col => row[col]))

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
    sql: `SELECT substring(timestamp, 1, 10) as day, COUNT(*) as checks\nFROM usage_events\nWHERE timestamp > NOW() - INTERVAL '30 days'\nGROUP BY day\nORDER BY day`,
    chart: 'line',
  },
  {
    label: 'Verdict Distribution',
    sql: `SELECT verdict, COUNT(*) as count\nFROM usage_events\nWHERE verdict != ''\nGROUP BY verdict\nORDER BY count DESC`,
    chart: 'donut',
  },
  {
    label: 'Top 20 Repos',
    sql: `SELECT repo, COUNT(*) as checks\nFROM usage_events\nWHERE repo != ''\nGROUP BY repo\nORDER BY checks DESC\nLIMIT 20`,
    chart: 'hbar',
  },
  {
    label: 'Hourly Traffic',
    sql: `SELECT substring(timestamp, 12, 2) as hr, COUNT(*) as requests\nFROM usage_events\nGROUP BY hr\nORDER BY hr`,
    chart: 'line',
  },
  {
    label: 'Top API Consumers',
    sql: `SELECT api_key, COUNT(*) as requests\nFROM usage_events\nWHERE api_key != 'anon'\nGROUP BY api_key\nORDER BY requests DESC\nLIMIT 10`,
    chart: 'bar',
  },
  {
    label: 'Geo Distribution',
    sql: `SELECT country, COUNT(*) as requests\nFROM usage_events\nWHERE country != 'XX'\nGROUP BY country\nORDER BY requests DESC\nLIMIT 20`,
    chart: 'bar',
  },
  {
    label: 'Cache Hit Ratio',
    sql: `SELECT cache_status, COUNT(*) as count\nFROM usage_events\nGROUP BY cache_status`,
    chart: 'donut',
  },
  {
    label: 'User Agents',
    sql: `SELECT user_agent, COUNT(*) as count\nFROM usage_events\nGROUP BY user_agent`,
    chart: 'donut',
  },
  {
    label: 'Score Distribution',
    sql: `SELECT\n  CASE\n    WHEN score >= 80 THEN 'healthy (80-100)'\n    WHEN score >= 60 THEN 'stable (60-79)'\n    WHEN score >= 40 THEN 'degraded (40-59)'\n    WHEN score >= 20 THEN 'critical (20-39)'\n    ELSE 'unmaintained (0-19)'\n  END as bucket,\n  COUNT(*) as count\nFROM result_events\nGROUP BY bucket\nORDER BY count DESC`,
    chart: 'donut',
  },
  {
    label: 'Event Sources',
    sql: `SELECT source, COUNT(*) as count\nFROM usage_events\nGROUP BY source\nORDER BY count DESC`,
    chart: 'donut',
  },
]
