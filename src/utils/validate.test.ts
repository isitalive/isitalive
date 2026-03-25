import { describe, expect, it } from 'vitest'
import { isValidParam } from './validate'

describe('isValidParam', () => {
  // ── Valid inputs ──────────────────────────────────────────────────────
  it('accepts lowercase names', () => {
    expect(isValidParam('vercel')).toBe(true)
  })

  it('accepts uppercase names', () => {
    expect(isValidParam('Vercel')).toBe(true)
  })

  it('accepts names with dots', () => {
    expect(isValidParam('next.js')).toBe(true)
  })

  it('accepts names with dashes', () => {
    expect(isValidParam('my-repo')).toBe(true)
  })

  it('accepts names with underscores', () => {
    expect(isValidParam('my_repo')).toBe(true)
  })

  it('accepts single character', () => {
    expect(isValidParam('a')).toBe(true)
  })

  it('accepts exactly 100 characters', () => {
    expect(isValidParam('a'.repeat(100))).toBe(true)
  })

  // ── Dot-segment rejection ────────────────────────────────────────────
  it('rejects single dot (path traversal)', () => {
    expect(isValidParam('.')).toBe(false)
  })

  it('rejects double dot (path traversal)', () => {
    expect(isValidParam('..')).toBe(false)
  })

  it('accepts dot-prefixed names (e.g. .github)', () => {
    // GitHub repos can start with dots, just not exactly "." or ".."
    expect(isValidParam('.github')).toBe(true)
    expect(isValidParam('.dotfiles')).toBe(true)
  })

  // ── Invalid inputs ────────────────────────────────────────────────────
  it('rejects empty string', () => {
    expect(isValidParam('')).toBe(false)
  })

  it('rejects names longer than 100 characters', () => {
    expect(isValidParam('a'.repeat(101))).toBe(false)
  })

  it('rejects forward slashes (path traversal)', () => {
    expect(isValidParam('../etc/passwd')).toBe(false)
    expect(isValidParam('owner/repo')).toBe(false)
  })

  it('rejects backslashes', () => {
    expect(isValidParam('back\\slash')).toBe(false)
  })

  it('rejects spaces', () => {
    expect(isValidParam('has space')).toBe(false)
  })

  it('rejects XSS payloads', () => {
    expect(isValidParam('<script>')).toBe(false)
    expect(isValidParam('alert("xss")')).toBe(false)
    expect(isValidParam('"><img src=x onerror=alert(1)>')).toBe(false)
  })

  it('rejects query string characters', () => {
    expect(isValidParam('repo?foo=bar')).toBe(false)
    expect(isValidParam('repo&bar')).toBe(false)
    expect(isValidParam('repo#hash')).toBe(false)
  })

  it('rejects null bytes', () => {
    expect(isValidParam('repo\0')).toBe(false)
  })

  it('rejects percent encoding', () => {
    expect(isValidParam('repo%00')).toBe(false)
    expect(isValidParam('%2e%2e')).toBe(false)
  })
})
