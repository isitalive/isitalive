import { describe, expect, it } from 'vitest'
import { test, fc } from '@fast-check/vitest'
import {
  parseGoMod,
  parseGoSum,
  parsePackageJson,
  parsePackageLock,
  parsePnpmLock,
  parseYarnLockFile,
  parseManifest,
} from './parsers'

// ── parseGoMod ─────────────────────────────────────────────────────────
describe('parseGoMod', () => {
  it('parses a block require', () => {
    const content = `
module example.com/myapp

go 1.21

require (
	github.com/stretchr/testify v1.8.4
	github.com/gin-gonic/gin v1.9.1
)
`
    const deps = parseGoMod(content)
    expect(deps).toHaveLength(2)
    expect(deps[0]).toEqual({
      name: 'github.com/stretchr/testify',
      version: 'v1.8.4',
      dev: false,
      ecosystem: 'go',
      dependencyType: 'direct',
      sourceFormat: 'go.mod',
    })
  })

  it('parses single-line requires', () => {
    const content = `
module example.com/app
go 1.21
require github.com/foo/bar v1.2.3
`
    const deps = parseGoMod(content)
    expect(deps).toHaveLength(1)
    expect(deps[0].name).toBe('github.com/foo/bar')
    expect(deps[0].version).toBe('v1.2.3')
  })

  it('marks single-line indirect requires as transitive', () => {
    const content = `
module example.com/app
go 1.21
require github.com/foo/bar v1.2.3 // indirect
`
    const deps = parseGoMod(content)
    expect(deps).toHaveLength(1)
    expect(deps[0]).toMatchObject({
      name: 'github.com/foo/bar',
      version: 'v1.2.3',
      dev: true,
      dependencyType: 'transitive',
    })
  })

  it('marks indirect deps as dev', () => {
    const content = `
module example.com/app

require (
	github.com/direct/dep v1.0.0
	github.com/indirect/dep v2.0.0 // indirect
)
`
    const deps = parseGoMod(content)
    expect(deps).toHaveLength(2)
    expect(deps[0].dev).toBe(false)
    expect(deps[1].dev).toBe(true)
  })

  it('filters out Go stdlib modules', () => {
    const content = `
module example.com/app

require (
	golang.org/toolchain v0.0.1-go1.21.0.linux-amd64
	github.com/real/dep v1.0.0
)
`
    const deps = parseGoMod(content)
    expect(deps).toHaveLength(1)
    expect(deps[0].name).toBe('github.com/real/dep')
  })

  it('keeps golang.org/x/ packages (not stdlib)', () => {
    const content = `
module example.com/app

require (
	golang.org/x/text v0.14.0
	golang.org/x/crypto v0.16.0
)
`
    const deps = parseGoMod(content)
    expect(deps).toHaveLength(2)
    expect(deps[0].name).toBe('golang.org/x/text')
  })

  it('deduplicates by name (keeps first occurrence)', () => {
    const content = `
module example.com/app

require (
	github.com/foo/bar v1.0.0
	github.com/foo/bar v1.1.0
)
`
    const deps = parseGoMod(content)
    expect(deps).toHaveLength(1)
    expect(deps[0].version).toBe('v1.0.0')
  })

  it('skips comments inside require blocks', () => {
    const content = `
require (
	// this is a comment
	github.com/foo/bar v1.0.0
)
`
    const deps = parseGoMod(content)
    expect(deps).toHaveLength(1)
  })

  it('returns empty for empty content', () => {
    expect(parseGoMod('')).toEqual([])
  })

  it('returns empty for content with no require', () => {
    const content = `
module example.com/app
go 1.21
`
    expect(parseGoMod(content)).toEqual([])
  })

  it('handles mixed block and single-line requires', () => {
    const content = `
module example.com/app

require github.com/single/dep v1.0.0

require (
	github.com/block/dep v2.0.0
)
`
    const deps = parseGoMod(content)
    expect(deps).toHaveLength(2)
  })
})

// ── parsePackageJson ───────────────────────────────────────────────────
describe('parsePackageJson', () => {
  it('parses production dependencies', () => {
    const content = JSON.stringify({
      dependencies: {
        hono: '^4.0.0',
        lodash: '^4.17.0',
      },
    })
    const deps = parsePackageJson(content)
    expect(deps).toHaveLength(2)
    expect(deps[0]).toEqual({
      name: 'hono',
      version: '^4.0.0',
      dev: false,
      ecosystem: 'npm',
      dependencyType: 'direct',
      sourceFormat: 'package.json',
    })
  })

  it('parses dev dependencies', () => {
    const content = JSON.stringify({
      devDependencies: {
        vitest: '^3.0.0',
        typescript: '^5.0.0',
      },
    })
    const deps = parsePackageJson(content)
    expect(deps).toHaveLength(2)
    expect(deps.every(d => d.dev)).toBe(true)
  })

  it('merges prod and dev dependencies', () => {
    const content = JSON.stringify({
      dependencies: { hono: '^4.0.0' },
      devDependencies: { vitest: '^3.0.0' },
    })
    const deps = parsePackageJson(content)
    expect(deps).toHaveLength(2)
    expect(deps[0].dev).toBe(false)
    expect(deps[1].dev).toBe(true)
  })

  it('returns empty for missing dependencies', () => {
    const content = JSON.stringify({ name: 'my-app', version: '1.0.0' })
    const deps = parsePackageJson(content)
    expect(deps).toEqual([])
  })

  it('returns empty for empty dependencies objects', () => {
    const content = JSON.stringify({ dependencies: {}, devDependencies: {} })
    const deps = parsePackageJson(content)
    expect(deps).toEqual([])
  })

  it('throws on invalid JSON', () => {
    expect(() => parsePackageJson('{')).toThrow('Invalid package.json')
  })

  it('handles non-string version values by coercing to string', () => {
    const content = JSON.stringify({
      dependencies: { 'weird-version': 123 },
    })
    const deps = parsePackageJson(content)
    expect(deps[0].version).toBe('123')
  })

  it('handles scoped package names', () => {
    const content = JSON.stringify({
      dependencies: { '@scope/package': '^1.0.0' },
    })
    const deps = parsePackageJson(content)
    expect(deps[0].name).toBe('@scope/package')
  })
})

// ── lockfile parsers ──────────────────────────────────────────────────
describe('lockfile parsers', () => {
  it('parses package-lock v3 packages and preserves duplicate package versions', () => {
    const content = JSON.stringify({
      lockfileVersion: 3,
      packages: {
        '': { dependencies: { react: '^18.2.0' } },
        'node_modules/react': { version: '18.2.0' },
        'node_modules/app/node_modules/react': { version: '17.0.2', dev: true },
        'node_modules/@scope/pkg': { version: '1.0.0' },
      },
    })

    const deps = parsePackageLock(content)

    expect(deps.map(dep => `${dep.name}@${dep.version}`).sort()).toEqual([
      '@scope/pkg@1.0.0',
      'react@17.0.2',
      'react@18.2.0',
    ])
    expect(deps.find(dep => dep.version === '17.0.2')).toMatchObject({
      dev: true,
      dependencyType: 'dev',
      sourceFormat: 'package-lock.json',
    })
    expect(deps.find(dep => dep.name === '@scope/pkg')).toMatchObject({
      dev: true,
      dependencyType: 'transitive',
    })
  })

  it('parses package-lock v2/v1 dependency trees', () => {
    const content = JSON.stringify({
      lockfileVersion: 2,
      dependencies: {
        leftpad: { version: '1.3.0' },
        nested: {
          version: '1.0.0',
          dependencies: {
            transitive: { version: '2.0.0', dev: true },
          },
        },
      },
    })

    const deps = parsePackageLock(content)

    expect(deps.map(dep => dep.name).sort()).toEqual(['leftpad', 'nested', 'transitive'])
    expect(deps.find(dep => dep.name === 'transitive')).toMatchObject({ dev: true })
    expect(deps.find(dep => dep.name === 'leftpad')).toMatchObject({ dev: true, dependencyType: 'transitive' })
  })

  it('parses pnpm-lock.yaml packages with direct/dev/transitive metadata', () => {
    const deps = parsePnpmLock(`
lockfileVersion: '9.0'
importers:
  .:
    dependencies:
      react:
        specifier: ^18.2.0
        version: 18.2.0
    devDependencies:
      vitest:
        specifier: ^1.0.0
        version: 1.0.0
packages:
  react@18.2.0: {}
  vitest@1.0.0: {}
  '@scope/pkg@2.0.0': {}
`)

    expect(deps.find(dep => dep.name === 'react')).toMatchObject({ dependencyType: 'direct', dev: false })
    expect(deps.find(dep => dep.name === 'vitest')).toMatchObject({ dependencyType: 'dev', dev: true })
    expect(deps.find(dep => dep.name === '@scope/pkg')).toMatchObject({ dependencyType: 'transitive', version: '2.0.0' })
  })

  it('parses Yarn v1 lockfiles', () => {
    const deps = parseYarnLockFile(`
left-pad@^1.3.0:
  version "1.3.0"
  resolved "https://registry.yarnpkg.com/left-pad/-/left-pad-1.3.0.tgz"

"@scope/pkg@^2.0.0":
  version "2.0.1"
`)

    expect(deps).toEqual([
      expect.objectContaining({ name: 'left-pad', version: '1.3.0', dependencyType: 'transitive' }),
      expect.objectContaining({ name: '@scope/pkg', version: '2.0.1', dependencyType: 'transitive' }),
    ])
  })

  it('parses go.sum entries, strips /go.mod, and dedupes module versions', () => {
    const deps = parseGoSum(`
github.com/foo/bar v1.0.0 h1:abc
github.com/foo/bar v1.0.0/go.mod h1:def
github.com/foo/bar v1.1.0 h1:ghi
`)

    expect(deps.map(dep => `${dep.name}@${dep.version}`)).toEqual([
      'github.com/foo/bar@v1.0.0',
      'github.com/foo/bar@v1.1.0',
    ])
    expect(deps.every(dep => dep.dependencyType === 'transitive')).toBe(true)
  })

  it('throws sanitized parser errors for malformed lockfiles', () => {
    expect(() => parsePackageLock('{')).toThrow('Invalid package-lock.json')
    expect(() => parsePnpmLock('packages:\n  - [')).toThrow('Invalid pnpm-lock.yaml')
  })
})

// ── parseManifest (dispatch) ───────────────────────────────────────────
describe('parseManifest', () => {
  it('dispatches to parseGoMod for go.mod format', () => {
    const content = `
module example.com/app
require github.com/foo/bar v1.0.0
`
    const deps = parseManifest('go.mod', content)
    expect(deps).toHaveLength(1)
    expect(deps[0].ecosystem).toBe('go')
  })

  it('dispatches to parsePackageJson for package.json format', () => {
    const content = JSON.stringify({ dependencies: { hono: '^4.0.0' } })
    const deps = parseManifest('package.json', content)
    expect(deps).toHaveLength(1)
    expect(deps[0].ecosystem).toBe('npm')
  })

  it('dispatches to lockfile parsers', () => {
    expect(parseManifest('go.sum', 'github.com/foo/bar v1.0.0 h1:abc')).toHaveLength(1)
    expect(parseManifest('package-lock.json', JSON.stringify({ packages: { 'node_modules/a': { version: '1.0.0' } } }))).toHaveLength(1)
    expect(parseManifest('pnpm-lock.yaml', 'packages:\n  a@1.0.0: {}\n')).toHaveLength(1)
    expect(parseManifest('yarn.lock', 'a@^1.0.0:\n  version "1.0.0"\n')).toHaveLength(1)
  })

  it('throws on unsupported format', () => {
    expect(() => parseManifest('requirements.txt' as any, 'flask==2.0')).toThrow('Unsupported format')
  })
})

// ── Fuzz: parseGoMod never throws (fast-check) ────────────────────────
describe('parseGoMod fuzz', () => {
  test.prop([fc.string()])('never throws on arbitrary string input', (input) => {
    expect(() => parseGoMod(input)).not.toThrow()
  })

  test.prop([fc.string()])('never returns stdlib modules regardless of input', (body) => {
    const input = `require (\n${body}\n)`
    const deps = parseGoMod(input)
    for (const dep of deps) {
      expect(dep.name).not.toBe('go')
      expect(dep.name.startsWith('toolchain')).toBe(false)
    }
  })

  test.prop([fc.string()])('every returned dep has ecosystem "go"', (input) => {
    const deps = parseGoMod(input)
    for (const dep of deps) {
      expect(dep.ecosystem).toBe('go')
      expect(typeof dep.name).toBe('string')
      expect(dep.name.length).toBeGreaterThan(0)
      expect(typeof dep.version).toBe('string')
      expect(typeof dep.dev).toBe('boolean')
    }
  })

  test.prop([fc.string()])('result has no duplicate names', (input) => {
    const deps = parseGoMod(input)
    const names = deps.map(d => d.name)
    expect(new Set(names).size).toBe(names.length)
  })
})

// ── Fuzz: parsePackageJson never throws on valid JSON (fast-check) ────
describe('parsePackageJson fuzz', () => {
  // Use fc.array of tuples instead of fc.dictionary to avoid its slow
  // uniqueArray internals + shrinking that cause seed-dependent timeouts.
  // Plain fc.string is fine — the parser accepts any JSON object shape.
  const depMapArb = fc
    .array(
      fc.tuple(
        fc.string({ minLength: 1, maxLength: 20 }),
        fc.string({ maxLength: 10 }),
      ),
      { maxLength: 10 },
    )
    .map((pairs) => Object.fromEntries(pairs))

  const packageJsonArb = fc.record({
    name: fc.option(fc.string({ maxLength: 50 }), { nil: undefined }),
    version: fc.option(fc.string({ maxLength: 20 }), { nil: undefined }),
    dependencies: fc.option(depMapArb, { nil: undefined }),
    devDependencies: fc.option(depMapArb, { nil: undefined }),
  })

  // Timeout set to 30s — the CI fuzz job runs 10k iterations (FC_NUM_RUNS=10000)
  test.prop([packageJsonArb])('never throws on valid package.json objects', (pkg) => {
    const content = JSON.stringify(pkg)
    expect(() => parsePackageJson(content)).not.toThrow()

    const deps = parsePackageJson(content)
    for (const dep of deps) {
      expect(dep.ecosystem).toBe('npm')
      expect(typeof dep.name).toBe('string')
      expect(typeof dep.version).toBe('string')
      expect(typeof dep.dev).toBe('boolean')
    }
  })

  test.prop([fc.string({ maxLength: 200 })])('never throws on arbitrary string (may throw on non-JSON)', (input) => {
    try {
      const deps = parsePackageJson(input)
      for (const dep of deps) {
        expect(dep.ecosystem).toBe('npm')
      }
    } catch (e: any) {
      // Only acceptable error is invalid JSON
      expect(e.message).toContain('Invalid package.json')
    }
  })
})
