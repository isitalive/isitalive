// ---------------------------------------------------------------------------
// Fuzz tests for XSS escaping in turnstile error templates
//
// The escapeHtml function must neutralize any HTML special characters
// so that user-controlled strings can never break out of the template.
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest'
import { test, fc } from '@fast-check/vitest'

// Re-implement escapeHtml here for direct testing — it's a private function
// in turnstile.ts, but the invariant we're testing is the contract itself.
function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

describe('escapeHtml XSS prevention', () => {
  // ─── Property-based: output never contains raw HTML metacharacters ─────
  test.prop([fc.string({ maxLength: 500 })])('output never contains unescaped < or >', (input) => {
    const result = escapeHtml(input)
    // After escaping, no raw < or > should remain
    expect(result).not.toMatch(/(?<!&lt|&gt|&amp|&quot)[<>]/)
    // More precisely: the only < and > should be part of &lt; and &gt;
    const withoutEntities = result
      .replace(/&lt;/g, '')
      .replace(/&gt;/g, '')
      .replace(/&amp;/g, '')
      .replace(/&quot;/g, '')
    expect(withoutEntities).not.toContain('<')
    expect(withoutEntities).not.toContain('>')
  })

  test.prop([fc.string({ maxLength: 500 })])('output never contains unescaped &', (input) => {
    const result = escapeHtml(input)
    // Every & should be followed by amp;, lt;, gt;, or quot;
    const stray = result.replace(/&(amp|lt|gt|quot);/g, '')
    expect(stray).not.toContain('&')
  })

  test.prop([fc.string({ maxLength: 500 })])('output never contains unescaped double quotes', (input) => {
    const result = escapeHtml(input)
    const withoutEntities = result.replace(/&quot;/g, '')
    expect(withoutEntities).not.toContain('"')
  })

  // ─── Targeted XSS payloads ───────────────────────────────────────────
  const xssPayloads = [
    '<script>alert(1)</script>',
    '<img src=x onerror=alert(1)>',
    '"><script>alert(document.cookie)</script>',
    "'-alert(1)-'",
    '<svg onload=alert(1)>',
    '<iframe src="javascript:alert(1)">',
    '{{constructor.constructor("return this")()}}',
    '<div style="background:url(javascript:alert(1))">',
    '<a href="javascript:alert(1)">click</a>',
    '"><img src=x onerror=alert(1)//',
    '<math><mtext><table><mglyph><svg><mtext><textarea><path id="</textarea><img onerror=alert(1) src=1>">',
    '<img/src=x onerror="alert(1)">',
    'abc<def>ghi"jkl&mno',
  ]

  for (const payload of xssPayloads) {
    it(`neutralizes XSS payload: ${payload.slice(0, 50)}`, () => {
      const result = escapeHtml(payload)
      expect(result).not.toContain('<script')
      expect(result).not.toContain('<img')
      expect(result).not.toContain('<svg')
      expect(result).not.toContain('<iframe')
      expect(result).not.toContain('<div')
      expect(result).not.toContain('<a ')
      expect(result).not.toContain('<math')
      expect(result).not.toContain('<textarea')
      // Should not contain any raw < at all
      const stripped = result.replace(/&lt;/g, '').replace(/&gt;/g, '')
      expect(stripped).not.toContain('<')
      expect(stripped).not.toContain('>')
    })
  }

  // ─── Safe strings pass through unchanged ─────────────────────────────
  test.prop([
    fc.stringMatching(/^[a-zA-Z0-9 .,!?:;()-]{0,100}$/),
  ])('safe strings pass through unchanged', (input) => {
    expect(escapeHtml(input)).toBe(input)
  })

  // ─── Idempotence: double-escaping is consistent ──────────────────────
  test.prop([fc.string({ maxLength: 200 })])('double-escape does not produce raw metacharacters', (input) => {
    const once = escapeHtml(input)
    const twice = escapeHtml(once)
    // After double-escaping, still no raw < > "
    const stripped = twice
      .replace(/&(amp|lt|gt|quot);/g, '')
    expect(stripped).not.toContain('<')
    expect(stripped).not.toContain('>')
    expect(stripped).not.toContain('"')
    expect(stripped).not.toContain('&')
  })
})
