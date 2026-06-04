// ---------------------------------------------------------------------------
// D1 SQL proxy — read-only admin query helper
//
// Kept under the legacy module/function name so existing imports and tests keep
// working while the runtime dependency moves away from R2 SQL.
// ---------------------------------------------------------------------------

import type { Env } from '../types/env'
import { fetchWithTimeout } from '../utils/http'

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

const R2_SQL_TIMEOUT_MS = 20_000

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
 * Rewrite trivial "GROUP BY same selected column" queries to DISTINCT.
 * This keeps semantics for dedupe-style queries while avoiding heavier grouping.
 */
export function optimizeReadQuery(sql: string): string {
  const trimmed = sql.trim().replace(/\s*;?\s*$/, '')
  const simpleDistinctMatch = trimmed.match(
    /^SELECT\s+([a-z_][a-z0-9_\.]*)\s+FROM\s+([\s\S]+?)\s+GROUP\s+BY\s+\1$/i,
  )

  if (!simpleDistinctMatch) {
    return sql
  }

  const [, column, fromAndWhere] = simpleDistinctMatch
  return `SELECT DISTINCT ${column}\nFROM ${fromAndWhere}`
}

/**
 * Execute a read-only SQL query against D1.
 */
export async function queryR2SQL(env: Env, sql: string): Promise<QueryResult> {
  const start = Date.now()

  // Validate
  const error = validateReadOnly(sql)
  if (error) {
    return { columns: [], rows: [], rowCount: 0, timing: 0, error }
  }

  sql = optimizeReadQuery(sql)

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

  if (!env.DB) {
    const legacy = env as unknown as {
      CF_ACCOUNT_ID?: string
      CF_R2_SQL_TOKEN?: string
      CF_R2_WAREHOUSE?: string
    }
    if (legacy.CF_ACCOUNT_ID && legacy.CF_R2_SQL_TOKEN && legacy.CF_R2_WAREHOUSE) {
      return queryLegacyR2SQL({
        CF_ACCOUNT_ID: legacy.CF_ACCOUNT_ID,
        CF_R2_SQL_TOKEN: legacy.CF_R2_SQL_TOKEN,
        CF_R2_WAREHOUSE: legacy.CF_R2_WAREHOUSE,
      }, sql, start)
    }
    return {
      columns: [],
      rows: [],
      rowCount: 0,
      timing: Date.now() - start,
      error: 'D1 is not configured. Bind the isitalive-db database as DB.',
    }
  }

  try {
    const raw = await env.DB.prepare(sql).raw({ columnNames: true })
    const [columns = [], ...rows] = raw as [string[], ...any[][]]

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
      error: `Failed to query D1: ${err.message}`,
    }
  }
}

async function queryLegacyR2SQL(
  env: { CF_ACCOUNT_ID: string; CF_R2_SQL_TOKEN: string; CF_R2_WAREHOUSE: string },
  sql: string,
  start: number,
): Promise<QueryResult> {
  try {
    const response = await fetchWithTimeout(
      `https://api.sql.cloudflarestorage.com/api/v1/accounts/${env.CF_ACCOUNT_ID}/r2-sql/query/${env.CF_R2_WAREHOUSE}`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.CF_R2_SQL_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: sql }),
        timeoutMs: R2_SQL_TIMEOUT_MS,
        timeoutMessage: `R2 SQL request timed out after ${R2_SQL_TIMEOUT_MS}ms`,
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
    if (!data.success) {
      const errors = data.errors?.map((entry: any) => entry.message).join(', ') || 'Unknown error'
      return { columns: [], rows: [], rowCount: 0, timing: Date.now() - start, error: errors }
    }

    const result = data.result
    if (!result || !Array.isArray(result.rows) || result.rows.length === 0) {
      return { columns: [], rows: [], rowCount: 0, timing: Date.now() - start }
    }

    const columns: string[] = Array.isArray(result.schema)
      ? result.schema.map((col: any) => col.name)
      : Object.keys(result.rows[0])
    const rows = result.rows.map((row: any) => columns.map((col) => row[col]))

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
    sql: `SELECT day, SUM(checks) as checks\nFROM daily_usage_repo\nWHERE day >= date('now', '-30 days')\nGROUP BY day\nORDER BY day`,
    chart: 'line',
  },
  {
    label: 'Verdict Distribution',
    sql: `SELECT latest_verdict as verdict, SUM(checks) as count\nFROM daily_usage_repo\nWHERE latest_verdict != ''\nGROUP BY latest_verdict\nORDER BY count DESC`,
    chart: 'donut',
  },
  {
    label: 'Top 20 Repos',
    sql: `SELECT repo, SUM(checks) as checks\nFROM daily_usage_repo\nWHERE repo != ''\nGROUP BY repo\nORDER BY checks DESC\nLIMIT 20`,
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
  {
    label: 'Language Distribution',
    sql: `SELECT json_extract(data_json, '$.data.language') as language, COUNT(*) as count\nFROM provider_events\nWHERE json_extract(data_json, '$.data.language') IS NOT NULL\nGROUP BY language\nORDER BY count DESC\nLIMIT 15`,
    chart: 'bar',
  },
  {
    label: 'Top Repos by Stars',
    sql: `SELECT owner || '/' || repo as project, MAX(stars) as stars\nFROM provider_events\nGROUP BY project\nORDER BY stars DESC\nLIMIT 20`,
    chart: 'hbar',
  },
  {
    label: 'Signal Averages',
    sql: `SELECT\n  ROUND(AVG(json_extract(data_json, '$.data.signal_last_commit_score')), 1) as last_commit,\n  ROUND(AVG(json_extract(data_json, '$.data.signal_last_release_score')), 1) as last_release,\n  ROUND(AVG(json_extract(data_json, '$.data.signal_stars_score')), 1) as stars,\n  ROUND(AVG(json_extract(data_json, '$.data.signal_ci_score')), 1) as ci,\n  ROUND(AVG(json_extract(data_json, '$.data.signal_bus_factor_score')), 1) as bus_factor,\n  ROUND(AVG(json_extract(data_json, '$.data.signal_issue_staleness_score')), 1) as issues,\n  ROUND(AVG(json_extract(data_json, '$.data.signal_pr_responsiveness_score')), 1) as prs,\n  ROUND(AVG(json_extract(data_json, '$.data.signal_recent_contributors_score')), 1) as contributors\nFROM result_events`,
    chart: 'bar',
  },
]
