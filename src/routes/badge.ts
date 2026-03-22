// ---------------------------------------------------------------------------
// /api/badge/:provider/:owner/:repo — SVG health badge for READMEs
// ---------------------------------------------------------------------------

import { Hono } from 'hono';
import type { Env } from '../scoring/types';
import type { Verdict } from '../scoring/types';
import { providers, revalidateInBackground } from '../providers/index';
import { scoreProject } from '../scoring/engine';
import { getCached, putCache } from '../cache/index';

const badge = new Hono<{ Bindings: Env }>();

const VERDICT_COLORS: Record<Verdict, string> = {
  healthy: '#22c55e',
  stable: '#eab308',
  degraded: '#f97316',
  critical: '#ef4444',
  unmaintained: '#6b7280',
};



function generateSvg(score: number, verdict: Verdict): string {
  const color = VERDICT_COLORS[verdict];
  const label = 'is it alive?';
  const value = `${score} · ${verdict}`;
  const labelWidth = 80;
  const valueWidth = 110;
  const totalWidth = labelWidth + valueWidth;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="20" role="img" aria-label="${label}: ${value}">
  <title>${label}: ${value}</title>
  <linearGradient id="s" x2="0" y2="100%">
    <stop offset="0" stop-color="#bbb" stop-opacity=".1"/>
    <stop offset="1" stop-opacity=".1"/>
  </linearGradient>
  <clipPath id="r"><rect width="${totalWidth}" height="20" rx="3" fill="#fff"/></clipPath>
  <g clip-path="url(#r)">
    <rect width="${labelWidth}" height="20" fill="#555"/>
    <rect x="${labelWidth}" width="${valueWidth}" height="20" fill="${color}"/>
    <rect width="${totalWidth}" height="20" fill="url(#s)"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" text-rendering="geometricPrecision" font-size="11">
    <text aria-hidden="true" x="${labelWidth / 2}" y="15" fill="#010101" fill-opacity=".3">${label}</text>
    <text x="${labelWidth / 2}" y="14">${label}</text>
    <text aria-hidden="true" x="${labelWidth + valueWidth / 2}" y="15" fill="#010101" fill-opacity=".3">${value}</text>
    <text x="${labelWidth + valueWidth / 2}" y="14">${value}</text>
  </g>
</svg>`;
}



badge.get('/:provider/:owner/:repo', async (c) => {
  const { provider, owner, repo } = c.req.param();

  if (!Object.hasOwn(providers, provider)) {
    return c.text('Unsupported provider', 400);
  }

  try {
    const { result: cached, status } = await getCached(c.env, provider, owner, repo);

    let result = cached;

    if (status === 'stale' && cached) {
      // Serve stale, revalidate in background
      c.executionCtx.waitUntil(revalidateInBackground(c.env, provider, owner, repo));
    }

    if (!result) {
      const prov = providers[provider as keyof typeof providers];
      const rawData = await prov.fetchProject(owner, repo, c.env.GITHUB_TOKEN);
      result = scoreProject(rawData, prov.name);
      c.executionCtx.waitUntil(putCache(c.env, provider, owner, repo, result));
    }

    const svg = generateSvg(result.score, result.verdict);

    return c.body(svg, 200, {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
      'CDN-Cache-Control': 'public, s-maxage=86400',
    });
  } catch {
    // Fallback badge on error
    const svg = generateSvg(0, 'unmaintained');
    return c.body(svg, 200, {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 'public, max-age=300',
    });
  }
});

export { badge };
