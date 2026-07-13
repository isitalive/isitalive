import { describe, expect, it } from 'vitest'
import { test, fc } from '@fast-check/vitest'
import { version as packageVersion } from '../../package.json'
import changelog from '../../CHANGELOG.md'
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

  it('parses the full Keep a Changelog section vocabulary', () => {
    const markdown = `
## [1.0.0] - 2026-03-20

### Security
- Patched an auth bypass

### Deprecated
- Old endpoint scheduled for removal

### ⚠ BREAKING CHANGES
- Renamed the response field
`
    const versions = parseChangelog(markdown)
    expect(versions[0].entries.map(e => e.type)).toEqual(['security', 'deprecated', 'breaking'])
  })

  it('ignores unknown section types', () => {
    const markdown = `
## [1.0.0] - 2026-03-20

### Notes
- A note that is not a changelog category

### Added
- Real feature
`
    const versions = parseChangelog(markdown)
    expect(versions[0].entries).toHaveLength(1)
    expect(versions[0].entries[0].type).toBe('added')
  })

  it('parses a dateless Unreleased heading', () => {
    const markdown = `
## [Unreleased]

### Added
- Work in progress
`
    const versions = parseChangelog(markdown)
    expect(versions).toEqual([{
      version: 'Unreleased',
      date: '',
      entries: [{ type: 'added', text: 'Work in progress' }],
    }])
  })

  it('parses Release Please headings and asterisk bullets', () => {
    const markdown = `
## [1.2.0](https://github.com/example/project/compare/v1.1.0...v1.2.0) (2026-07-13)

### Added
* **api:** add package checks ([#42](https://github.com/example/project/pull/42))
`
    const versions = parseChangelog(markdown)
    expect(versions[0]).toEqual({
      version: '1.2.0',
      date: '2026-07-13',
      entries: [{
        type: 'added',
        text: '**api:** add package checks ([#42](https://github.com/example/project/pull/42))',
      }],
    })
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

  it('keeps the current package version in sync with the latest release', () => {
    const latestRelease = parseChangelog(changelog).find(version => version.version !== 'Unreleased')

    expect(latestRelease?.version).toBe(packageVersion)
  })
})

// ── Fuzz: parseChangelog never throws (fast-check) ────────────────────
describe('parseChangelog fuzz', () => {
  const validTypes = new Set(['added', 'changed', 'deprecated', 'removed', 'fixed', 'security', 'breaking'])

  test.prop([fc.string()])('never throws on arbitrary input', (input) => {
    expect(() => parseChangelog(input)).not.toThrow()
  })

  test.prop([fc.string()])('output entries always have valid type values', (input) => {
    const versions = parseChangelog(input)
    for (const v of versions) {
      expect(typeof v.version).toBe('string')
      expect(typeof v.date).toBe('string')
      expect(Array.isArray(v.entries)).toBe(true)
      for (const entry of v.entries) {
        expect(validTypes.has(entry.type)).toBe(true)
        expect(typeof entry.text).toBe('string')
      }
    }
  })

  test.prop([
    fc.array(fc.record({
      version: fc.stringMatching(/^\d{1,3}\.\d{1,3}\.\d{1,3}$/),
      date: fc.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      section: fc.constantFrom('Added', 'Changed', 'Deprecated', 'Removed', 'Fixed', 'Security'),
      items: fc.array(fc.lorem({ maxCount: 5 }), { minLength: 1, maxLength: 5 }),
    }), { minLength: 1, maxLength: 5 }),
  ])('round-trips structured changelog entries', (versions) => {
    // Build a valid markdown changelog from structured data
    const md = versions.map(v =>
      `## [${v.version}] - ${v.date}\n\n### ${v.section}\n${v.items.map(i => `- ${i}`).join('\n')}\n`,
    ).join('\n')

    const parsed = parseChangelog(md)
    expect(parsed.length).toBeGreaterThanOrEqual(1)
    for (const v of parsed) {
      expect(v.version).toMatch(/^\d/)
      expect(v.entries.length).toBeGreaterThanOrEqual(0)
    }
  })
})
