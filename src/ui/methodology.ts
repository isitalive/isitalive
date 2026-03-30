// ---------------------------------------------------------------------------
// Methodology page — explains how the health score is calculated
// ---------------------------------------------------------------------------

import { navbarHtml, footerHtml, componentCss, themeCss, themeScript, themeHeadScript } from './components';
import { ogTags } from './og';
import { analyticsScript } from './analytics';
import { TIERS } from '../cache/index';
import { CACHE_STATUS_DEFINITIONS, METHODOLOGY, SIGNAL_DEFINITIONS, VERDICT_DEFINITIONS } from '../scoring/methodology';

const SIGNAL_COLORS: Record<string, string> = {
  lastCommit: '#6366f1',
  lastRelease: '#8b5cf6',
  prResponsiveness: '#a855f7',
  issueStaleness: '#d946ef',
  recentContributors: '#ec4899',
  busFactor: '#f43f5e',
  ciActivity: '#f97316',
  starsTrend: '#64748b',
}

const VERDICT_COLORS: Record<string, string> = {
  healthy: '#22c55e',
  stable: '#eab308',
  degraded: '#f97316',
  critical: '#ef4444',
  unmaintained: '#6b7280',
}

const VERDICT_EMOJI: Record<string, string> = {
  healthy: '🟢',
  stable: '🟡',
  degraded: '🟠',
  critical: '🔴',
  unmaintained: '⚫',
}

export function methodologyPage(analyticsToken?: string): string {
  const weightSegments = SIGNAL_DEFINITIONS.map((signal) => `
        <div class="weight-bar-segment" style="flex: ${signal.weight * 100}; background: ${SIGNAL_COLORS[signal.name]};" title="${signal.label} — ${signal.weight * 100}%"><span class="seg-label">${signal.label.replace('Responsiveness', '').replace('Contributors', 'Contribs')} ${signal.weight * 100}%</span></div>
  `).join('')

  const weightLegend = SIGNAL_DEFINITIONS.map((signal) => `
        <span class="weight-legend-item"><span class="weight-legend-dot" style="background:${SIGNAL_COLORS[signal.name]}"></span>${signal.label}</span>
  `).join('')

  const signalCards = SIGNAL_DEFINITIONS.map((signal) => `
    <div class="signal-card">
      <div class="signal-card-header">
        <span class="signal-card-title">${signal.label}</span>
        <span class="signal-card-weight">${signal.weight * 100}%</span>
      </div>
      <p>${signal.description}</p>
      <table class="scoring-table">
        <tr><th>${signal.tableHeaders[0]}</th><th>${signal.tableHeaders[1]}</th></tr>
        ${signal.tableRows.map((row) => `<tr><td>${row[0]}</td><td>${row[1]}</td></tr>`).join('')}
      </table>
      ${signal.notes?.map((note) => `<div class="note-box"><strong>Note:</strong> ${note}</div>`).join('') ?? ''}
      <p class="data-source">Source: ${signal.source} · ${signal.measurement === 'direct' ? 'Direct measurement' : 'Sampled proxy'}</p>
    </div>
  `).join('')

  const verdictCards = VERDICT_DEFINITIONS.map((verdict) => `
      <div class="verdict-chip">
        <div class="emoji">${VERDICT_EMOJI[verdict.name]}</div>
        <div class="name" style="color: ${VERDICT_COLORS[verdict.name]}">${verdict.label}</div>
        <div class="range">${verdict.minScore} – ${verdict.maxScore}</div>
      </div>
  `).join('')

  const cacheRows = [
    ['Free', TIERS.free.freshTtl, TIERS.free.staleTtl],
    ['Pro', TIERS.pro.freshTtl, TIERS.pro.staleTtl],
    ['Enterprise', TIERS.enterprise.freshTtl, TIERS.enterprise.staleTtl],
  ].map(([label, freshTtl, staleTtl]) => `
      <tr><td>${label}</td><td>${formatSeconds(freshTtl as number)}</td><td>${formatSeconds(staleTtl as number)}</td></tr>
  `).join('')

  const cacheStatusRows = CACHE_STATUS_DEFINITIONS.map((status) => `
      <tr><td>${status.name}</td><td>${status.label}</td></tr>
  `).join('')

  return `<!DOCTYPE html>
<html lang="en" data-theme="system">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
  <title>How We Score — Is It Alive?</title>
  <meta name="description" content="Understand how Is It Alive? calculates open-source project health scores. 8 weighted signals, transparent methodology.">
  ${ogTags({
    title: 'How We Score — Is It Alive?',
    description: 'Understand how Is It Alive? calculates open-source project health scores. 8 weighted signals, transparent methodology.',
    url: 'https://isitalive.dev/methodology',
  })}
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="preload" as="style" href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap">
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" media="print" onload="this.media='all'">
  ${themeHeadScript}
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    ${themeCss}
    ${componentCss}

    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      background: var(--bg-primary);
      color: var(--text-primary);
      min-height: 100vh;
      line-height: 1.6;
      transition: background 0.3s, color 0.3s;
    }

    .container {
      position: relative;
      z-index: 1;
      max-width: 900px;
      margin: 0 auto;
      padding: 40px 24px 0;
    }

    h1 {
      font-size: 2rem;
      font-weight: 800;
      margin: 0 0 12px;
      letter-spacing: -0.02em;
    }

    .intro {
      color: var(--text-secondary);
      font-size: 0.95rem;
      margin-bottom: 32px;
      max-width: 100%;
    }

    /* ── Weight visualization bar ─────────────────────────────────────── */
    .weight-bar-container {
      margin-bottom: 40px;
    }
    .weight-bar-label {
      font-size: 0.75rem;
      font-weight: 600;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 10px;
    }
    .weight-bar {
      display: flex;
      border-radius: 8px;
      overflow: hidden;
      height: 32px;
      gap: 2px;
    }
    .weight-bar-segment {
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 0.65rem;
      font-weight: 700;
      color: #fff;
      transition: opacity 0.2s;
      cursor: default;
      position: relative;
    }
    .weight-bar-segment:hover { opacity: 0.85; }
    .weight-bar-segment .seg-label {
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      padding: 0 4px;
    }
    .weight-legend {
      display: flex;
      flex-wrap: wrap;
      gap: 12px 20px;
      margin-top: 12px;
      font-size: 0.75rem;
      color: var(--text-secondary);
    }
    .weight-legend-item {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .weight-legend-dot {
      width: 10px;
      height: 10px;
      border-radius: 3px;
      flex-shrink: 0;
    }

    h2 {
      font-size: 1.15rem;
      font-weight: 700;
      margin: 48px 0 20px;
      color: var(--text-primary);
    }

    .signal-card {
      background: transparent;
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 24px 28px;
      margin-bottom: 16px;
      transition: border-color 0.3s;
    }
    .signal-card:hover { border-color: var(--text-muted); }

    .signal-card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
    }

    .signal-card-title {
      font-size: 1rem;
      font-weight: 600;
    }

    .signal-card-weight {
      background: var(--accent);
      color: var(--accent-text);
      padding: 4px 12px;
      border-radius: 4px;
      font-size: 0.75rem;
      font-weight: 700;
    }

    .signal-card p {
      color: var(--text-secondary);
      font-size: 0.85rem;
      margin-bottom: 12px;
    }

    .scoring-table {
      width: 100%;
      font-size: 0.8rem;
      border-collapse: collapse;
    }

    .scoring-table th {
      text-align: left;
      color: var(--text-muted);
      font-weight: 500;
      padding: 6px 0;
      border-bottom: 1px solid var(--border);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      font-size: 0.7rem;
    }

    .scoring-table td {
      padding: 6px 0;
      color: var(--text-secondary);
      border-bottom: 1px solid var(--border);
    }

    .scoring-table td:last-child {
      text-align: right;
      font-weight: 600;
      color: var(--text-primary);
    }

    .verdict-section {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
      gap: 12px;
      margin-top: 16px;
    }

    .verdict-chip {
      background: transparent;
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 16px;
      text-align: center;
    }

    .verdict-chip .emoji { font-size: 1.3rem; margin-bottom: 6px; }
    .verdict-chip .name { font-size: 0.82rem; font-weight: 600; margin-bottom: 2px; }
    .verdict-chip .range { font-size: 0.72rem; color: var(--text-muted); }

    .note-box {
      background: transparent;
      border: 1px solid var(--border);
      border-left: 3px solid var(--accent);
      border-radius: 6px;
      padding: 16px 20px;
      margin: 16px 0;
      font-size: 0.85rem;
      color: var(--text-secondary);
    }
    .note-box strong { color: var(--text-primary); }

    .data-source {
      color: var(--text-muted);
      font-size: 0.75rem;
      font-style: italic;
      margin-top: 4px;
    }

    .example-links {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 12px;
    }
    .example-link {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 14px;
      border: 1px solid var(--border);
      border-radius: 6px;
      font-size: 0.8rem;
      color: var(--text-secondary);
      text-decoration: none;
      transition: border-color 0.2s, color 0.2s;
    }
    .example-link:hover { border-color: var(--accent); color: var(--text-primary); }

    @media (max-width: 640px) {
      h1 { font-size: 1.5rem; }
      .signal-card { padding: 18px; }
      .verdict-section { grid-template-columns: repeat(2, 1fr); }
      .scoring-table { display: block; overflow-x: auto; }
      .note-box { padding: 12px 16px; }
      .weight-bar-segment .seg-label { font-size: 0.55rem; }
    }
  </style>
</head>
<body>

  ${navbarHtml}

  <div class="container">
    <h1>How We Score</h1>
    <p class="intro">${METHODOLOGY.description} Every project is evaluated across 8 weighted GitHub-backed signals and combined into a single 0-100 score.</p>
    <div class="note-box">
      <strong>Scope:</strong> This is a maintenance-health score. It is designed to help humans and AI agents decide whether a dependency looks actively maintained. It is not a security, license, or compliance verdict.
    </div>

    <!-- Weight visualization bar -->
    <div class="weight-bar-container">
      <div class="weight-bar-label">Signal Weights</div>
      <div class="weight-bar">
        ${weightSegments}
      </div>
      <div class="weight-legend">
        ${weightLegend}
      </div>
    </div>

    <h2>Signals</h2>
    ${signalCards}

    <h2>Verdicts</h2>
    <p style="color: var(--text-secondary); font-size: 0.85rem; margin-bottom: 16px;">The weighted score maps to one of five verdicts — each describes the <strong>observed maintenance state</strong>, not a trajectory or risk guarantee.</p>

    <div class="verdict-section">
      ${verdictCards}
    </div>

    <p style="color: var(--text-secondary); font-size: 0.85rem; margin-top: 20px;">See for yourself:</p>
    <div class="example-links">
      <a class="example-link" href="/github/vercel/next.js">🟢 vercel/next.js</a>
      <a class="example-link" href="/github/honojs/hono">🟡 honojs/hono</a>
      <a class="example-link" href="/github/lodash/lodash">🟠 lodash/lodash</a>
    </div>

    <h2>Overrides</h2>
    <div class="note-box">
      <strong>Archived repositories</strong> are automatically scored 0 with the verdict "Unmaintained" regardless of other signals. If the repository owner has explicitly archived it, the project is no longer maintained.
    </div>

    <h2>Caching</h2>
    <p style="color: var(--text-secondary); font-size: 0.85rem;">Results are cached to avoid excessive API calls and to keep responses fast. Cache TTLs depend on your API tier:</p>
    <table class="scoring-table" style="margin-top: 12px; margin-bottom: 40px;">
      <tr><th>Tier</th><th>Fresh TTL</th><th>Stale TTL</th></tr>
      ${cacheRows}
    </table>

    <h2>Cache Status</h2>
    <p style="color: var(--text-secondary); font-size: 0.85rem; margin-bottom: 12px;">API responses use canonical cache status names so agents can tell whether a score came from a fresh fetch or a cached evaluation.</p>
    <table class="scoring-table" style="margin-bottom: 16px;">
      <tr><th>Status</th><th>Meaning</th></tr>
      ${cacheStatusRows}
    </table>

    <p style="color: var(--text-secondary); font-size: 0.85rem; margin-bottom: 8px;">During the <strong>stale</strong> window, you'll receive the cached result immediately while a background refresh runs. After the stale window, a fresh fetch is triggered synchronously.</p>

  </div>

  ${footerHtml}
  ${themeScript}
  ${analyticsScript(analyticsToken)}
</body>
</html>`;
}

function formatSeconds(seconds: number): string {
  if (seconds % (60 * 60 * 24) === 0) return `${seconds / (60 * 60 * 24)} day${seconds === 60 * 60 * 24 ? '' : 's'}`
  if (seconds % (60 * 60) === 0) return `${seconds / (60 * 60)} hour${seconds === 60 * 60 ? '' : 's'}`
  return `${seconds / 60} minutes`
}
