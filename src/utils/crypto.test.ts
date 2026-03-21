// ---------------------------------------------------------------------------
// Tests for shared crypto utilities
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest'
import { timingSafeEqual, bufferToHex, sha256Hex } from './crypto'

describe('timingSafeEqual', () => {
  it('returns true for identical strings', () => {
    expect(timingSafeEqual('hello', 'hello')).toBe(true)
  })

  it('returns true for empty strings', () => {
    expect(timingSafeEqual('', '')).toBe(true)
  })

  it('returns false for different strings of the same length', () => {
    expect(timingSafeEqual('hello', 'world')).toBe(false)
  })

  it('returns false for strings of different lengths', () => {
    expect(timingSafeEqual('short', 'longer')).toBe(false)
    expect(timingSafeEqual('longer', 'short')).toBe(false)
  })

  it('returns false when one string is empty', () => {
    expect(timingSafeEqual('', 'notempty')).toBe(false)
    expect(timingSafeEqual('notempty', '')).toBe(false)
  })

  it('detects single-character differences', () => {
    expect(timingSafeEqual('abcdef', 'abcdeg')).toBe(false)
    expect(timingSafeEqual('abcdef', 'Abcdef')).toBe(false)
  })

  it('handles unicode strings', () => {
    expect(timingSafeEqual('héllo', 'héllo')).toBe(true)
    expect(timingSafeEqual('héllo', 'hello')).toBe(false)
  })

  it('handles long strings', () => {
    const a = 'x'.repeat(10000)
    const b = 'x'.repeat(10000)
    expect(timingSafeEqual(a, b)).toBe(true)
    const c = 'x'.repeat(9999) + 'y'
    expect(timingSafeEqual(a, c)).toBe(false)
  })
})

describe('bufferToHex', () => {
  it('converts an empty buffer', () => {
    expect(bufferToHex(new ArrayBuffer(0))).toBe('')
  })

  it('converts a known buffer to hex', () => {
    const buf = new Uint8Array([0x00, 0xff, 0x0a, 0xbc]).buffer
    expect(bufferToHex(buf)).toBe('00ff0abc')
  })

  it('produces lowercase hex', () => {
    const buf = new Uint8Array([0xDE, 0xAD, 0xBE, 0xEF]).buffer
    expect(bufferToHex(buf)).toBe('deadbeef')
  })
})

describe('sha256Hex', () => {
  it('hashes an empty string', async () => {
    const hash = await sha256Hex('')
    // SHA-256 of empty string is a well-known value
    expect(hash).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
  })

  it('hashes a known string', async () => {
    const hash = await sha256Hex('hello')
    expect(hash).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824')
  })

  it('produces a 64-character hex string', async () => {
    const hash = await sha256Hex('test input')
    expect(hash).toHaveLength(64)
    expect(hash).toMatch(/^[0-9a-f]+$/)
  })

  it('is deterministic', async () => {
    const h1 = await sha256Hex('deterministic')
    const h2 = await sha256Hex('deterministic')
    expect(h1).toBe(h2)
  })
})
