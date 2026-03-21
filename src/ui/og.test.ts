import { describe, expect, it } from 'vitest'
import { ogTags } from './og'

describe('ogTags', () => {
  const base = {
    title: 'Test Title',
    description: 'Test description',
    url: 'https://isitalive.dev/test',
  }

  it('includes og:title, og:description, og:url, og:site_name', () => {
    const html = ogTags(base)
    expect(html).toContain('property="og:title" content="Test Title"')
    expect(html).toContain('property="og:description" content="Test description"')
    expect(html).toContain('property="og:url" content="https://isitalive.dev/test"')
    expect(html).toContain('property="og:site_name" content="Is It Alive?"')
  })

  it('includes twitter card tags', () => {
    const html = ogTags(base)
    expect(html).toContain('name="twitter:card" content="summary"')
    expect(html).toContain('name="twitter:title" content="Test Title"')
    expect(html).toContain('name="twitter:description" content="Test description"')
  })

  it('includes canonical link', () => {
    const html = ogTags(base)
    expect(html).toContain('rel="canonical" href="https://isitalive.dev/test"')
  })

  it('defaults og:type to website', () => {
    const html = ogTags(base)
    expect(html).toContain('property="og:type" content="website"')
  })

  it('includes og:image and twitter:image when image is provided', () => {
    const html = ogTags({ ...base, image: 'https://isitalive.dev/api/badge/github/vercel/next.js' })
    expect(html).toContain('property="og:image" content="https://isitalive.dev/api/badge/github/vercel/next.js"')
    expect(html).toContain('name="twitter:image" content="https://isitalive.dev/api/badge/github/vercel/next.js"')
  })

  it('omits og:image when image is not provided', () => {
    const html = ogTags(base)
    expect(html).not.toContain('og:image')
    expect(html).not.toContain('twitter:image')
  })

  it('HTML-escapes values to prevent XSS', () => {
    const html = ogTags({
      title: '<script>alert("xss")</script>',
      description: 'foo & "bar"',
      url: 'https://isitalive.dev/<evil>',
    })
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
    expect(html).toContain('foo &amp; &quot;bar&quot;')
    expect(html).toContain('&lt;evil&gt;')
  })

  it('respects custom type and twitterCard overrides', () => {
    const html = ogTags({ ...base, type: 'article', twitterCard: 'summary_large_image' })
    expect(html).toContain('property="og:type" content="article"')
    expect(html).toContain('name="twitter:card" content="summary_large_image"')
  })
})
