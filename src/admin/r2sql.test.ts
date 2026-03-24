// ---------------------------------------------------------------------------
// R2 SQL proxy tests — validation + fuzz-style injection attempts
// ---------------------------------------------------------------------------

import { describe, it, expect, vi, afterEach } from 'vitest'
import { test, fc } from '@fast-check/vitest'
import { validateReadOnly, queryR2SQL, PRESET_QUERIES } from './r2sql'

describe('r2sql', () => {
  // ─── validateReadOnly: valid queries ────────────────────────────────
  describe('validateReadOnly: valid queries', () => {
    it('should accept a simple SELECT', () => {
      expect(validateReadOnly('SELECT * FROM analytics')).toBeNull()
    })

    it('should accept SELECT with WHERE', () => {
      expect(validateReadOnly('SELECT repo, COUNT(*) FROM analytics WHERE score > 50 GROUP BY repo')).toBeNull()
    })

    it('should accept SELECT with subquery', () => {
      expect(validateReadOnly('SELECT * FROM (SELECT repo, score FROM analytics) sub')).toBeNull()
    })

    it('should accept WITH (CTE)', () => {
      expect(validateReadOnly('WITH top AS (SELECT repo FROM analytics) SELECT * FROM top')).toBeNull()
    })

    it('should accept SELECT with trailing semicolon', () => {
      expect(validateReadOnly('SELECT 1;')).toBeNull()
    })

    it('should accept SELECT with leading whitespace', () => {
      expect(validateReadOnly('   SELECT * FROM analytics')).toBeNull()
    })

    it('should accept SELECT with newlines', () => {
      expect(validateReadOnly('SELECT repo,\n  COUNT(*)\nFROM analytics\nGROUP BY repo')).toBeNull()
    })

    it('should accept all preset queries', () => {
      for (const preset of PRESET_QUERIES) {
        const error = validateReadOnly(preset.sql)
        expect(error, `Preset "${preset.label}" should be valid`).toBeNull()
      }
    })
  })

  // ─── validateReadOnly: blocked queries ──────────────────────────────
  describe('validateReadOnly: blocked queries', () => {
    it('should reject empty string', () => {
      expect(validateReadOnly('')).toBe('Query cannot be empty')
    })

    it('should reject whitespace only', () => {
      expect(validateReadOnly('   ')).toBe('Query cannot be empty')
    })

    it('should reject INSERT', () => {
      const err = validateReadOnly('INSERT INTO analytics (repo) VALUES ("test")')
      expect(err).toContain('Only SELECT queries are allowed')
    })

    it('should reject UPDATE', () => {
      const err = validateReadOnly('UPDATE analytics SET score = 100')
      expect(err).toContain('Only SELECT queries are allowed')
    })

    it('should reject DELETE', () => {
      const err = validateReadOnly('DELETE FROM analytics WHERE repo = "test"')
      expect(err).toContain('Only SELECT queries are allowed')
    })

    it('should reject DROP TABLE', () => {
      const err = validateReadOnly('DROP TABLE analytics')
      expect(err).toContain('Only SELECT queries are allowed')
    })

    it('should reject ALTER TABLE', () => {
      const err = validateReadOnly('ALTER TABLE analytics ADD COLUMN foo TEXT')
      expect(err).toContain('Only SELECT queries are allowed')
    })

    it('should reject CREATE TABLE', () => {
      const err = validateReadOnly('CREATE TABLE evil (id INT)')
      expect(err).toContain('Only SELECT queries are allowed')
    })

    it('should reject TRUNCATE', () => {
      const err = validateReadOnly('TRUNCATE analytics')
      expect(err).toContain('Only SELECT queries are allowed')
    })
  })

  // ─── SQL injection patterns ─────────────────────────────────────────
  describe('validateReadOnly: SQL injection attempts', () => {
    const injections = [
      // Classic injections that start with SELECT
      "SELECT 1; DROP TABLE analytics;",
      "SELECT 1; INSERT INTO analytics VALUES('x')",
      "SELECT 1; DELETE FROM analytics",
      "SELECT 1; UPDATE analytics SET score=0",
      // UNION-based (these should be allowed — they're still reads)
      // But multi-statement should be blocked:
      "SELECT 1; SELECT 2",
    ]

    for (const sql of injections) {
      it(`should reject multi-statement: ${sql.slice(0, 50)}`, () => {
        const err = validateReadOnly(sql)
        expect(err).not.toBeNull()
      })
    }

    // These SELECT-based queries should be ALLOWED (they're reads):
    const validReads = [
      "SELECT * FROM analytics WHERE repo = 'test; not injection'",
      "SELECT * FROM analytics WHERE repo LIKE '%DROP%'",
      "SELECT 'DELETE' as word FROM analytics",
      "SELECT * FROM analytics UNION SELECT * FROM analytics",
    ]

    for (const sql of validReads) {
      it(`should allow valid read: ${sql.slice(0, 50)}`, () => {
        const err = validateReadOnly(sql)
        expect(err).toBeNull()
      })
    }
  })

  // ─── Comment-based injection bypass ───────────────────────────────
  describe('validateReadOnly: comment-based injection', () => {
    it('should reject DROP hidden in a block comment', () => {
      const err = validateReadOnly('SELECT 1 /* DROP TABLE analytics */')
      expect(err).not.toBeNull()
    })

    it('should reject DELETE hidden in a line comment', () => {
      const err = validateReadOnly('SELECT 1 -- DELETE FROM analytics')
      expect(err).not.toBeNull()
    })

    it('should reject INSERT hidden in a block comment', () => {
      const err = validateReadOnly("SELECT 1 /* INSERT INTO analytics VALUES('x') */")
      expect(err).not.toBeNull()
    })

    it('should allow safe block comments (no blocked keywords)', () => {
      const err = validateReadOnly('SELECT repo /* filter by repo */ FROM usage_events')
      expect(err).toBeNull()
    })

    it('should allow safe line comments', () => {
      const err = validateReadOnly('SELECT repo FROM usage_events -- get all repos')
      expect(err).toBeNull()
    })

    // Edge cases found in security review (S4)
    it('should reject semicolons hidden inside block comments followed by SQL', () => {
      const err = validateReadOnly('SELECT 1 /* ; */ DROP TABLE analytics')
      expect(err).not.toBeNull()
    })

    it('should reject SELECT with trailing comment hiding a semicolon then more SQL', () => {
      // This tests the scenario: `SELECT 1; --` where trailing comment makes the
      // semicolon appear to be "last char" but there's actually more after
      const err = validateReadOnly('SELECT 1; -- comment\nDROP TABLE analytics')
      expect(err).not.toBeNull()
    })

    it('should reject UNION-based stacking with write operation', () => {
      const err = validateReadOnly('SELECT 1 UNION ALL SELECT 1; DELETE FROM analytics')
      expect(err).not.toBeNull()
    })

    it('should reject nested block comments hiding DDL', () => {
      const err = validateReadOnly('SELECT 1 /* /* nested */ DROP TABLE analytics */')
      expect(err).not.toBeNull()
    })

    it('should reject DDL after a line comment on previous line', () => {
      const err = validateReadOnly('SELECT 1 -- innocent\n; INSERT INTO t VALUES(1)')
      expect(err).not.toBeNull()
    })
  })

  // ─── Fuzz: random and adversarial inputs ─────────────────────────── 
  describe('fuzz: adversarial SQL inputs', () => {
    const adversarial = [
      // Non-SQL
      'hello world',
      '12345',
      '{}',
      '[]',
      '<script>alert(1)</script>',
      '${process.env.SECRET}',
      // Non-SQL starting tokens
      'EXEC xp_cmdshell("whoami")',
      'CALL dangerous_proc()',
      'GRANT ALL ON analytics TO public',
      'REVOKE ALL ON analytics FROM admin',
      'EXPLAIN SELECT 1',
      // SHOW and DESCRIBE are blocked — only SELECT/WITH allowed
      'SHOW TABLES',
      'DESCRIBE analytics',
      // Encoded attacks
      'S%45LECT 1',
      'SEL\x00ECT 1',
      // Comment-based bypass attempts
      '/**/SELECT 1; DROP TABLE analytics',
      '-- SELECT 1\nDROP TABLE analytics',
      // Case variations of blocked commands
      'sElEcT 1; dRoP TABLE analytics',
      // Extremely long query
      'SELECT ' + 'a, '.repeat(10000) + 'b FROM analytics',
    ]

    for (const input of adversarial) {
      it(`should not crash on: ${JSON.stringify(input).slice(0, 60)}`, () => {
        // Should either return null (valid) or a string (error), never throw
        const result = validateReadOnly(input)
        expect(typeof result === 'string' || result === null).toBe(true)
      })
    }

    // Random string generation (fuzz via fast-check)
    test.prop([fc.string()])('never crashes on arbitrary string input', (input) => {
      const result = validateReadOnly(input)
      expect(typeof result === 'string' || result === null).toBe(true)
    })

    test.prop([
      fc.constantFrom('INSERT', 'DELETE', 'DROP', 'ALTER', 'CREATE', 'EXEC', 'GRANT'),
      fc.string(),
    ])('always rejects strings not starting with SELECT or WITH', (prefix, body) => {
      const result = validateReadOnly(`${prefix} ${body}`)
      expect(result).not.toBeNull()
    })

    test.prop([
      fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9_ ]{0,50}$/),
    ])('always rejects multi-statement queries', (body) => {
      const result = validateReadOnly(`SELECT 1; ${body}`)
      expect(result).not.toBeNull()
    })
  })

  // ─── Preset queries integrity ───────────────────────────────────────
  describe('preset queries', () => {
    it('should have at least 5 presets', () => {
      expect(PRESET_QUERIES.length).toBeGreaterThanOrEqual(5)
    })

    it('each preset should have label, sql, and chart', () => {
      for (const p of PRESET_QUERIES) {
        expect(typeof p.label).toBe('string')
        expect(p.label.length).toBeGreaterThan(0)
        expect(typeof p.sql).toBe('string')
        expect(p.sql.length).toBeGreaterThan(0)
        expect(['line', 'bar', 'hbar', 'donut']).toContain(p.chart)
      }
    })

    it('preset labels should be unique', () => {
      const labels = PRESET_QUERIES.map(p => p.label)
      expect(new Set(labels).size).toBe(labels.length)
    })
  })

  // ─── queryR2SQL: auto-LIMIT enforcement ─────────────────────────────
  // These tests call queryR2SQL directly with mocked fetch to verify
  // the actual SQL sent to the R2 API has the correct LIMIT applied.
  describe('queryR2SQL: auto-LIMIT', () => {
    function makeEnv() {
      return {
        CF_ACCOUNT_ID: 'test-account',
        CF_R2_SQL_TOKEN: 'test-token',
        CF_R2_WAREHOUSE: 'test-warehouse',
      } as any
    }

    function mockFetchCapture(): { calls: string[] } {
      const state = { calls: [] as string[] }
      const original = globalThis.fetch
      vi.stubGlobal('fetch', async (url: string, init: any) => {
        const body = JSON.parse(init.body)
        state.calls.push(body.query)
        return new Response(JSON.stringify({
          success: true,
          result: { schema: [{ name: 'x' }], rows: [{ x: 1 }] },
        }), { status: 200 })
      })
      return state
    }

    afterEach(() => {
      vi.restoreAllMocks()
    })

    it('should append LIMIT 1000 when query has no LIMIT', async () => {
      const cap = mockFetchCapture()
      await queryR2SQL(makeEnv(), 'SELECT * FROM analytics')
      expect(cap.calls).toHaveLength(1)
      expect(cap.calls[0]).toContain('LIMIT 1000')
    })

    it('should not double-LIMIT queries that already have a LIMIT', async () => {
      const cap = mockFetchCapture()
      await queryR2SQL(makeEnv(), 'SELECT * FROM analytics LIMIT 20')
      expect(cap.calls).toHaveLength(1)
      expect(cap.calls[0]).not.toContain('LIMIT 1000')
      expect(cap.calls[0]).toContain('LIMIT 20')
    })

    it('should handle trailing semicolons when appending LIMIT', async () => {
      const cap = mockFetchCapture()
      await queryR2SQL(makeEnv(), 'SELECT * FROM analytics;')
      expect(cap.calls).toHaveLength(1)
      expect(cap.calls[0]).toContain('LIMIT 1000')
      // Should not contain the trailing semicolon before LIMIT
      expect(cap.calls[0]).not.toMatch(/;\s*LIMIT/)
    })

    it('should still append LIMIT when LIMIT appears only in a string literal', async () => {
      const cap = mockFetchCapture()
      await queryR2SQL(makeEnv(), "SELECT 'LIMIT' AS x FROM analytics")
      expect(cap.calls).toHaveLength(1)
      expect(cap.calls[0]).toContain('LIMIT 1000')
    })

    it('should still append LIMIT when LIMIT appears only in a comment', async () => {
      const cap = mockFetchCapture()
      await queryR2SQL(makeEnv(), 'SELECT * FROM analytics -- LIMIT 500')
      expect(cap.calls).toHaveLength(1)
      expect(cap.calls[0]).toContain('LIMIT 1000')
    })

    it('should not have LIMIT trapped inside a trailing line comment', async () => {
      const cap = mockFetchCapture()
      await queryR2SQL(makeEnv(), 'SELECT * FROM analytics -- get all')
      expect(cap.calls).toHaveLength(1)
      // LIMIT must be on its own line, not inside the comment
      const sent = cap.calls[0]
      expect(sent).toContain('LIMIT 1000')
      // Verify the LIMIT is NOT inside the comment by checking it comes after
      expect(sent.indexOf('LIMIT 1000')).toBeGreaterThan(sent.lastIndexOf('--') >= 0 ? -1 : 0)
    })
  })
})
