// ---------------------------------------------------------------------------
// Open Graph share card template — satori-compatible HTML
//
// Rendered to a 1200×630 PNG by workers-og in routes/og.ts. Satori supports
// a flexbox-only CSS subset: every multi-child element needs display:flex,
// no grid, no emoji (colored dots instead).
//
// This module is pure (string in, string out) so it stays unit-testable
// without loading the wasm renderer.
// ---------------------------------------------------------------------------

import type { Verdict } from '../scoring/types'
import { escapeHtml } from '../utils/html'

export const OG_IMAGE_WIDTH = 1200
export const OG_IMAGE_HEIGHT = 630

const VERDICT_COLORS: Record<Verdict, string> = {
  healthy: '#22c55e',
  stable: '#eab308',
  degraded: '#f97316',
  critical: '#ef4444',
  unmaintained: '#6b7280',
}

const VERDICT_LABELS: Record<Verdict, string> = {
  healthy: 'Healthy',
  stable: 'Stable',
  degraded: 'Degraded',
  critical: 'Critical',
  unmaintained: 'Unmaintained',
}

function normalizeVerdict(verdict: string): Verdict {
  return Object.hasOwn(VERDICT_COLORS, verdict) ? verdict as Verdict : 'unmaintained'
}

/** Shrink the repo line for long names so it stays on the card */
function repoFontSize(repo: string): number {
  if (repo.length > 28) return 40
  if (repo.length > 18) return 52
  return 66
}

export function ogImageHtml(rawOwner: string, rawRepo: string, score: number, rawVerdict: string): string {
  const owner = escapeHtml(rawOwner)
  const repo = escapeHtml(rawRepo)
  const verdict = normalizeVerdict(rawVerdict)
  const color = VERDICT_COLORS[verdict]
  const label = VERDICT_LABELS[verdict]
  const clampedScore = Math.max(0, Math.min(100, Math.round(score)))

  return `<div style="display:flex; flex-direction:column; justify-content:space-between; width:${OG_IMAGE_WIDTH}px; height:${OG_IMAGE_HEIGHT}px; background:#0a0a0f; padding:56px 72px; font-family:'Inter';">
  <div style="display:flex; align-items:center; width:100%;">
    <div style="display:flex; width:16px; height:16px; border-radius:50%; background:#6366f1; margin-right:14px;"></div>
    <span style="color:#e8e8ed; font-size:32px; font-weight:700;">Is It Alive?</span>
    <span style="display:flex; flex:1;"></span>
    <span style="color:#8b8b9e; font-size:26px;">isitalive.dev</span>
  </div>
  <div style="display:flex; align-items:center; justify-content:space-between; flex:1; width:100%;">
    <div style="display:flex; flex-direction:column; max-width:740px; margin-right:48px;">
      <span style="color:#8b8b9e; font-size:34px; margin-bottom:6px;">${owner}/</span>
      <span style="color:#e8e8ed; font-size:${repoFontSize(rawRepo)}px; font-weight:800; line-height:1.1; margin-bottom:28px;">${repo}</span>
      <div style="display:flex;">
        <div style="display:flex; align-items:center; padding:12px 28px; border-radius:999px; border:3px solid ${color}; background:${color}1f;">
          <div style="display:flex; width:16px; height:16px; border-radius:50%; background:${color}; margin-right:14px;"></div>
          <span style="color:${color}; font-size:30px; font-weight:700;">${label}</span>
        </div>
      </div>
    </div>
    <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; width:280px; height:280px; border-radius:50%; border:18px solid ${color}; background:#12121a;">
      <span style="color:${color}; font-size:104px; font-weight:800; line-height:1;">${clampedScore}</span>
      <span style="color:#8b8b9e; font-size:28px;">/ 100</span>
    </div>
  </div>
  <div style="display:flex; width:100%;">
    <span style="color:#8b8b9e; font-size:24px;">Maintenance-health score from 8 weighted signals — not a security verdict</span>
  </div>
</div>`
}
