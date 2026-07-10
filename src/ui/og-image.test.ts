import { describe, expect, it } from 'vitest'
import { ogImageHtml, OG_IMAGE_WIDTH, OG_IMAGE_HEIGHT } from './og-image'

describe('ogImageHtml', () => {
  it('renders the score, verdict label, and repo name', () => {
    const html = ogImageHtml('vercel', 'next.js', 92, 'healthy')
    expect(html).toContain('>92<')
    expect(html).toContain('Healthy')
    expect(html).toContain('vercel/')
    expect(html).toContain('next.js')
    expect(html).toContain('isitalive.dev')
  })

  it('uses the verdict color for the ring and pill', () => {
    expect(ogImageHtml('a', 'b', 92, 'healthy')).toContain('#22c55e')
    expect(ogImageHtml('a', 'b', 65, 'stable')).toContain('#eab308')
    expect(ogImageHtml('a', 'b', 45, 'degraded')).toContain('#f97316')
    expect(ogImageHtml('a', 'b', 25, 'critical')).toContain('#ef4444')
    expect(ogImageHtml('a', 'b', 0, 'unmaintained')).toContain('#6b7280')
  })

  it('falls back to unmaintained styling for unknown verdicts', () => {
    const html = ogImageHtml('a', 'b', 50, 'bogus-verdict')
    expect(html).toContain('#6b7280')
    expect(html).toContain('Unmaintained')
  })

  it('clamps scores into 0-100', () => {
    expect(ogImageHtml('a', 'b', 150, 'healthy')).toContain('>100<')
    expect(ogImageHtml('a', 'b', -5, 'unmaintained')).toContain('>0<')
  })

  it('escapes HTML in owner and repo names', () => {
    const html = ogImageHtml('<script>', 'x"y', 50, 'stable')
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
    expect(html).toContain('x&quot;y')
  })

  it('shrinks the font for long repo names', () => {
    const short = ogImageHtml('a', 'short', 50, 'stable')
    const long = ogImageHtml('a', 'a-very-long-repository-name-indeed-yes', 50, 'stable')
    expect(short).toContain('font-size:66px')
    expect(long).toContain('font-size:40px')
  })

  it('uses satori-safe flexbox layout with the card dimensions', () => {
    const html = ogImageHtml('a', 'b', 50, 'stable')
    expect(html).toContain(`width:${OG_IMAGE_WIDTH}px`)
    expect(html).toContain(`height:${OG_IMAGE_HEIGHT}px`)
    expect(html).not.toContain('display:grid')
  })
})
