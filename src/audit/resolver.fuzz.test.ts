// ---------------------------------------------------------------------------
// Fuzz tests for audit resolvers — property-based invariants
// ---------------------------------------------------------------------------

import { describe, expect } from 'vitest'
import { test, fc } from '@fast-check/vitest'
import { extractGitHub, resolveGopkgIn, resolveGoogleGolang } from './resolver'

describe('extractGitHub fuzz', () => {
  test.prop([fc.string()])('never throws on arbitrary input', (url) => {
    expect(() => extractGitHub(url)).not.toThrow()
  })

  test.prop([fc.string()])('returns null or valid {owner, repo} object', (url) => {
    const result = extractGitHub(url)
    if (result !== null) {
      expect(typeof result.owner).toBe('string')
      expect(result.owner.length).toBeGreaterThan(0)
      expect(typeof result.repo).toBe('string')
      expect(result.repo.length).toBeGreaterThan(0)
    }
  })

  test.prop([
    fc.stringMatching(/^[a-zA-Z0-9_-]{1,20}$/),
    fc.stringMatching(/^[a-zA-Z0-9_.-]{1,30}$/),
  ])('always extracts owner/repo from valid github.com URLs', (owner, repo) => {
    const formats = [
      `https://github.com/${owner}/${repo}`,
      `git+https://github.com/${owner}/${repo}.git`,
      `git://github.com/${owner}/${repo}.git`,
    ]
    for (const url of formats) {
      const result = extractGitHub(url)
      expect(result).not.toBeNull()
      expect(result!.owner).toBe(owner)
      // .git suffix is stripped, so repo should match
      expect(result!.repo).toBe(repo)
    }
  })
})

describe('resolveGopkgIn fuzz', () => {
  test.prop([fc.string()])('never throws on arbitrary input', (name) => {
    expect(() => resolveGopkgIn(name)).not.toThrow()
  })

  test.prop([fc.string()])('returns null or valid {owner, repo} object', (name) => {
    const result = resolveGopkgIn(name)
    if (result !== null) {
      expect(typeof result.owner).toBe('string')
      expect(typeof result.repo).toBe('string')
    }
  })

  test.prop([
    fc.stringMatching(/^[a-z][a-z0-9-]{0,15}$/),
    fc.stringMatching(/^[a-z][a-z0-9-]{0,15}$/),
    fc.integer({ min: 1, max: 9 }),
  ])('correctly resolves gopkg.in/owner/repo.vN', (owner, repo, version) => {
    const name = `gopkg.in/${owner}/${repo}.v${version}`
    const result = resolveGopkgIn(name)
    expect(result).not.toBeNull()
    expect(result!.owner).toBe(owner)
    expect(result!.repo).toBe(repo)
  })

  test.prop([
    fc.stringMatching(/^[a-z][a-z0-9-]{0,15}$/),
    fc.integer({ min: 1, max: 9 }),
  ])('correctly resolves gopkg.in/repo.vN (single-segment)', (repo, version) => {
    const name = `gopkg.in/${repo}.v${version}`
    const result = resolveGopkgIn(name)
    expect(result).not.toBeNull()
    expect(result!.owner).toBe(`go-${repo}`)
    expect(result!.repo).toBe(repo)
  })
})

describe('resolveGoogleGolang fuzz', () => {
  test.prop([fc.string()])('never throws on arbitrary input', (name) => {
    expect(() => resolveGoogleGolang(name)).not.toThrow()
  })

  test.prop([fc.string()])('returns null or valid {owner, repo} object', (name) => {
    const result = resolveGoogleGolang(name)
    if (result !== null) {
      expect(typeof result.owner).toBe('string')
      expect(typeof result.repo).toBe('string')
    }
  })

  test.prop([fc.string()])('never returns result for non-google.golang.org prefixed input', (suffix) => {
    // If it doesn't start with "google.golang.org/", should return null
    if (!suffix.startsWith('google.golang.org/')) {
      const result = resolveGoogleGolang(suffix)
      expect(result).toBeNull()
    }
  })
})
