// ---------------------------------------------------------------------------
// Fuzz tests for R2 SQL validation — security-focused property invariants
// ---------------------------------------------------------------------------

import { describe, expect } from 'vitest'
import { test, fc } from '@fast-check/vitest'
import { validateReadOnly } from './r2sql'

// SQL keyword arbitraries for generating realistic-looking queries
const sqlKeyword = fc.constantFrom(
  'SELECT', 'FROM', 'WHERE', 'GROUP BY', 'ORDER BY', 'LIMIT',
  'HAVING', 'UNION', 'JOIN', 'LEFT JOIN', 'INNER JOIN', 'ON',
  'AS', 'AND', 'OR', 'NOT', 'IN', 'LIKE', 'BETWEEN', 'IS NULL',
  'COUNT', 'SUM', 'AVG', 'MAX', 'MIN', 'DISTINCT', 'WITH',
)

const dangerousKeyword = fc.constantFrom(
  'INSERT', 'UPDATE', 'DELETE', 'DROP', 'ALTER', 'CREATE',
  'TRUNCATE', 'REPLACE', 'MERGE',
)

describe('validateReadOnly fuzz', () => {
  test.prop([fc.string()])('never throws on arbitrary input', (input) => {
    const result = validateReadOnly(input)
    expect(result === null || typeof result === 'string').toBe(true)
  })

  test.prop([
    dangerousKeyword,
    fc.string({ maxLength: 200 }),
  ])('always rejects queries starting with dangerous keywords', (keyword, rest) => {
    const sql = `${keyword} ${rest}`
    const result = validateReadOnly(sql)
    expect(result).not.toBeNull()
  })

  test.prop([
    fc.stringMatching(/^[a-z_, *]{0,50}$/),
    dangerousKeyword,
    fc.stringMatching(/^[a-z_, *]{0,50}$/),
  ])('rejects SELECT with injected dangerous keyword after semicolon', (selectBody, dangerous, rest) => {
    const sql = `SELECT ${selectBody}; ${dangerous} ${rest}`
    const result = validateReadOnly(sql)
    expect(result).not.toBeNull()
  })

  test.prop([
    fc.array(fc.stringMatching(/^[a-z_]{1,15}$/), { minLength: 1, maxLength: 10 }),
    fc.stringMatching(/^[a-z_]{1,15}$/),
  ])('accepts simple SELECT with column names and table', (columns, table) => {
    const sql = `SELECT ${columns.join(', ')} FROM ${table}`
    const result = validateReadOnly(sql)
    expect(result).toBeNull()
  })

  test.prop([
    fc.string({ maxLength: 100 }),
  ])('rejects empty or whitespace-only input', (_unused) => {
    expect(validateReadOnly('')).toBe('Query cannot be empty')
    expect(validateReadOnly('   ')).toBe('Query cannot be empty')
    expect(validateReadOnly('\n\t')).toBe('Query cannot be empty')
  })

  test.prop([
    dangerousKeyword,
    fc.string({ maxLength: 100 }),
  ])('rejects dangerous keywords even with case variations', (keyword, body) => {
    // Generate case variations
    const mixed = keyword.split('').map((c, i) =>
      i % 2 === 0 ? c.toLowerCase() : c.toUpperCase(),
    ).join('')
    const result = validateReadOnly(`${mixed} ${body}`)
    expect(result).not.toBeNull()
  })
})
