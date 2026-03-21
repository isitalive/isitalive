// ---------------------------------------------------------------------------
// R2 SQL proxy tests — validation + fuzz-style injection attempts
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest'
import { validateReadOnly, PRESET_QUERIES } from './r2sql'

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

    // Random string generation (fuzz)
    it('should handle 100 random strings without crashing', () => {
      for (let i = 0; i < 100; i++) {
        const len = Math.floor(Math.random() * 500) + 1
        const bytes = new Uint8Array(len)
        crypto.getRandomValues(bytes)
        const str = Array.from(bytes, b => String.fromCharCode(b % 128)).join('')
        const result = validateReadOnly(str)
        expect(typeof result === 'string' || result === null).toBe(true)
      }
    })

    // Should reject any random string that doesn't start with SELECT/WITH
    it('should reject random strings that do not start with SELECT or WITH', () => {
      const nonSelectStarters = ['A', 'B', 'Z', '1', '{', '[', '(', 'INSERT', 'DELETE', 'DROP']
      for (const prefix of nonSelectStarters) {
        const result = validateReadOnly(prefix + ' some random sql')
        expect(result).not.toBeNull()
      }
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
})
