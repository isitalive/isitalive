import { describe, expect, it } from 'vitest'
import { parseGoMod, parsePackageJson, parseManifest } from './parsers'

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

  it('throws on unsupported format', () => {
    expect(() => parseManifest('requirements.txt' as any, 'flask==2.0')).toThrow('Unsupported format')
  })
})

// ── Fuzz: parseGoMod never throws ──────────────────────────────────────
describe('parseGoMod fuzz', () => {
  // Seeded PRNG for reproducibility
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
    const chars = 'abcdefghijklmnopqrstuvwxyz./\n\t (){}[]@#$%^&*0123456789'
    let s = ''
    for (let i = 0; i < len; i++) {
      s += chars[Math.floor(rng() * chars.length)]
    }
    return s
  }

  it('never throws on random input (300 iterations)', () => {
    const rng = mulberry32(42)
    for (let i = 0; i < 300; i++) {
      const input = randomString(rng, 500)
      expect(() => parseGoMod(input)).not.toThrow()
    }
  })

  it('never returns stdlib modules regardless of input structure', () => {
    const rng = mulberry32(123)
    for (let i = 0; i < 300; i++) {
      const input = `require (\n${randomString(rng, 200)}\n)`
      const deps = parseGoMod(input)
      for (const dep of deps) {
        expect(dep.name).not.toBe('go')
        expect(dep.name.startsWith('toolchain')).toBe(false)
      }
    }
  })
})

// ── Fuzz: parsePackageJson never throws on valid JSON ──────────────────
describe('parsePackageJson fuzz', () => {
  function mulberry32(seed: number) {
    return function () {
      seed |= 0
      seed = (seed + 0x6d2b79f5) | 0
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
  }

  it('never throws on valid JSON objects (200 iterations)', () => {
    const rng = mulberry32(99)
    for (let i = 0; i < 200; i++) {
      // Build a random-ish but valid JSON object
      const obj: Record<string, any> = {}
      if (rng() > 0.5) {
        const deps: Record<string, string> = {}
        const count = Math.floor(rng() * 10)
        for (let j = 0; j < count; j++) {
          deps[`pkg-${j}`] = `^${Math.floor(rng() * 20)}.0.0`
        }
        obj.dependencies = deps
      }
      if (rng() > 0.5) {
        obj.devDependencies = { [`dev-${i}`]: '*' }
      }
      // Add random noise keys
      if (rng() > 0.7) {
        obj.name = `app-${i}`
        obj.version = '1.0.0'
        obj.scripts = { test: 'vitest' }
      }
      const content = JSON.stringify(obj)
      expect(() => parsePackageJson(content)).not.toThrow()

      // Output must have valid ecosystem values
      const deps = parsePackageJson(content)
      for (const dep of deps) {
        expect(dep.ecosystem).toBe('npm')
        expect(typeof dep.name).toBe('string')
        expect(typeof dep.version).toBe('string')
        expect(typeof dep.dev).toBe('boolean')
      }
    }
  })
})
