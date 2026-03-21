import { describe, expect, it } from 'vitest'
import { parseChangelog } from './parser'

describe('parseChangelog', () => {
  it('parses a single version with all section types', () => {
    const markdown = `
## [1.0.0] - 2026-03-20

### Added
- New feature A
- New feature B

### Changed
- Refactored module X

### Fixed
- Bug fix for issue #42

### Removed
- Deprecated API endpoint
`
    const versions = parseChangelog(markdown)
    expect(versions).toHaveLength(1)
    expect(versions[0].version).toBe('1.0.0')
    expect(versions[0].date).toBe('2026-03-20')
    expect(versions[0].entries).toHaveLength(5)

    const types = versions[0].entries.map(e => e.type)
    expect(types).toEqual(['added', 'added', 'changed', 'fixed', 'removed'])
  })

  it('parses multiple versions in order', () => {
    const markdown = `
## [2.0.0] - 2026-03-20

### Added
- Version 2 feature

## [1.0.0] - 2026-01-01

### Fixed
- Version 1 fix
`
    const versions = parseChangelog(markdown)
    expect(versions).toHaveLength(2)
    expect(versions[0].version).toBe('2.0.0')
    expect(versions[1].version).toBe('1.0.0')
  })

  it('ignores unknown section types', () => {
    const markdown = `
## [1.0.0] - 2026-03-20

### Security
- Security patch

### Added
- Real feature
`
    const versions = parseChangelog(markdown)
    expect(versions[0].entries).toHaveLength(1)
    expect(versions[0].entries[0].type).toBe('added')
  })

  it('returns empty array for empty input', () => {
    expect(parseChangelog('')).toEqual([])
  })

  it('returns empty for content with no version headings', () => {
    const markdown = `
# Changelog
All notable changes to this project will be documented in this file.
`
    expect(parseChangelog(markdown)).toEqual([])
  })

  it('skips entries before the first version heading', () => {
    const markdown = `
# Changelog

- This should be ignored

## [1.0.0] - 2026-03-20

### Added
- Real entry
`
    const versions = parseChangelog(markdown)
    expect(versions).toHaveLength(1)
    expect(versions[0].entries).toHaveLength(1)
  })

  it('skips non-list lines inside sections', () => {
    const markdown = `
## [1.0.0] - 2026-03-20

### Added
Some description paragraph that is not a list item.
- Actual list item
Another paragraph.
`
    const versions = parseChangelog(markdown)
    expect(versions[0].entries).toHaveLength(1)
    expect(versions[0].entries[0].text).toBe('Actual list item')
  })

  it('handles version with no entries', () => {
    const markdown = `
## [1.0.0] - 2026-03-20
`
    const versions = parseChangelog(markdown)
    expect(versions).toHaveLength(1)
    expect(versions[0].entries).toEqual([])
  })

  it('trims whitespace from dates and versions', () => {
    const markdown = `
## [0.1.0] - 2026-01-15
### Fixed
- A fix
`
    const versions = parseChangelog(markdown)
    expect(versions[0].version).toBe('0.1.0')
    expect(versions[0].date).toBe('2026-01-15')
  })
})

// ── Fuzz: parseChangelog never throws ──────────────────────────────────
describe('parseChangelog fuzz', () => {
  function mulberry32(seed: number) {
    return function () {
      seed |= 0
      seed = (seed + 0x6d2b79f5) | 0
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
  }

  function randomString(rng: () => number, maxLen: number): string {
    const len = Math.floor(rng() * maxLen)
    const chars = 'abcdefghijklmnopqrstuvwxyz-_./\n\t #[]()0123456789'
    let s = ''
    for (let i = 0; i < len; i++) {
      s += chars[Math.floor(rng() * chars.length)]
    }
    return s
  }

  it('never throws on random input (300 iterations)', () => {
    const rng = mulberry32(77)
    for (let i = 0; i < 300; i++) {
      const input = randomString(rng, 500)
      expect(() => parseChangelog(input)).not.toThrow()
    }
  })

  it('output entries always have valid type values', () => {
    const rng = mulberry32(88)
    const validTypes = new Set(['added', 'changed', 'fixed', 'removed'])
    for (let i = 0; i < 200; i++) {
      const input = randomString(rng, 300)
      const versions = parseChangelog(input)
      for (const v of versions) {
        for (const entry of v.entries) {
          expect(validTypes.has(entry.type)).toBe(true)
        }
      }
    }
  })
})
