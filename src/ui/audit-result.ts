// ---------------------------------------------------------------------------
// Audit result page — dependency health report with drilldown
//
// Reads from cached audit data (KV: audit:result:{hash}).
// Shareable via /audit/{hash} — pure read of cached data.
// ---------------------------------------------------------------------------

import type { AuditResult, AuditDep } from '../audit/scorer'
import { navbarHtml, footerHtml, componentCss } from './components'
import { escapeHtml } from './error'
import { ogTags } from './og'
import { analyticsScript } from './analytics'

const VERDICT_COLORS: Record<string, string> = {
  healthy: '#22c55e',
  stable: '#eab308',
  degraded: '#f97316',
  critical: '#ef4444',
  unmaintained: '#6b7280',
  pending: '#8b8b9e',
  unresolved: '#55556a',
}

const VERDICT_EMOJI: Record<string, string> = {
  healthy: '✅',
  stable: '🟡',
  degraded: '⚠️',
  critical: '🔴',
  unmaintained: '⚫',
  pending: '⏳',
  unresolved: '❓',
}

function scoreColor(score: number): string {
  if (score >= 80) return '#22c55e'
  if (score >= 60) return '#eab308'
  if (score >= 40) return '#f97316'
  if (score >= 20) return '#ef4444'
  return '#6b7280'
}

function avgScoreVerdict(score: number): string {
  if (score >= 80) return 'healthy'
  if (score >= 60) return 'stable'
  if (score >= 40) return 'degraded'
  if (score >= 20) return 'critical'
  return 'unmaintained'
}

function renderDepRow(dep: AuditDep): string {
  const name = escapeHtml(dep.name)
  const version = escapeHtml(dep.version)
  const emoji = VERDICT_EMOJI[dep.verdict] || '❓'
  const color = VERDICT_COLORS[dep.verdict] || '#6b7280'
  const scoreText = dep.score !== null ? String(dep.score) : '—'
  const scoreStyle = dep.score !== null ? `color: ${scoreColor(dep.score)}` : 'color: var(--text-muted)'
  const verdictLabel = dep.verdict.charAt(0).toUpperCase() + dep.verdict.slice(1)
  const devBadge = dep.dev ? '<span class="dev-badge">dev</span>' : ''

  const link = dep.github
    ? `<a href="/github/${escapeHtml(dep.github)}" class="dep-link" title="View health details">→</a>`
    : ''

  const unresolvedHint = dep.unresolvedReason
    ? `<span class="unresolved-hint" title="${escapeHtml(dep.unresolvedReason)}">ⓘ</span>`
    : ''

  return `
    <tr class="dep-row" data-score="${dep.score ?? -1}" data-verdict="${dep.verdict}">
      <td class="dep-name">
        <span class="dep-name-text">${name}</span>
        ${devBadge}
        <span class="dep-version">${version}</span>
      </td>
      <td class="dep-score" style="${scoreStyle}">${scoreText}</td>
      <td class="dep-verdict">
        <span class="verdict-dot" style="background: ${color}"></span>
        <span style="color: ${color}">${emoji} ${verdictLabel}</span>
        ${unresolvedHint}
      </td>
      <td class="dep-action">${link}</td>
    </tr>`
}

export function auditResultPage(result: AuditResult, analyticsToken?: string): string {
  const avgScore = result.summary.avgScore
  const avgColor = scoreColor(avgScore)
  const avgVerdict = avgScoreVerdict(avgScore)
  const dashOffset = 283 - (283 * avgScore) / 100
  const shortHash = result.auditHash.slice(0, 12)

  // Separate prod and dev deps
  const prodDeps = result.dependencies.filter(d => !d.dev)
  const devDeps = result.dependencies.filter(d => d.dev)

  const prodRows = prodDeps.map(renderDepRow).join('')
  const devRows = devDeps.map(renderDepRow).join('')

  const formatLabel = result.format === 'package.json' ? 'package.json' : 'go.mod'

  const hashUrl = `https://isitalive.dev/audit/${result.auditHash}`
  const apiUrl = `curl -X POST https://isitalive.dev/api/manifest -H 'X-Manifest-Hash: ${result.auditHash}'`

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
  <title>Dependency Audit — Is It Alive?</title>
  <meta name="description" content="Dependency health audit: ${result.scored} of ${result.total} dependencies scored, avg score ${avgScore}/100. Checked by Is It Alive?">
  ${ogTags({
    title: 'Dependency Health Audit — Is It Alive?',
    description: `${result.scored}/${result.total} dependencies scored, avg score ${avgScore}/100`,
    url: hashUrl,
  })}
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="preload" as="style" href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap">
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" media="print" onload="this.media='all'">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    ${componentCss}

    :root {
      --bg-primary: #0a0a0f;
      --bg-secondary: #12121a;
      --surface: rgba(255,255,255,0.04);
      --surface-hover: rgba(255,255,255,0.08);
      --border: rgba(255,255,255,0.08);
      --text-primary: #e8e8ed;
      --text-secondary: #8b8b9e;
      --text-muted: #55556a;
      --accent: #6366f1;
      --accent-glow: rgba(99,102,241,0.3);
      --green: #22c55e;
      --yellow: #eab308;
      --orange: #f97316;
      --red: #ef4444;
      --gray: #6b7280;
    }

    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      background: var(--bg-primary);
      color: var(--text-primary);
      min-height: 100vh;
    }

    .bg-orb {
      position: fixed;
      border-radius: 50%;
      pointer-events: none;
      z-index: 0;
    }
    .bg-orb-1 { width: 500px; height: 500px; background: radial-gradient(circle, ${avgColor}22 0%, transparent 70%); top: -150px; right: -100px; }
    .bg-orb-2 { width: 400px; height: 400px; background: radial-gradient(circle, rgba(99,102,241,0.12) 0%, transparent 70%); bottom: -150px; left: -100px; }

    .container {
      position: relative;
      z-index: 1;
      max-width: 960px;
      margin: 0 auto;
      padding: 0 24px;
    }

    /* ── Hero / Summary ──────────────────── */
    .audit-hero {
      text-align: center;
      padding: 40px 0 36px;
    }

    .audit-title {
      font-size: 1.6rem;
      font-weight: 700;
      letter-spacing: -0.02em;
      margin-bottom: 6px;
    }

    .audit-subtitle {
      font-size: 0.9rem;
      color: var(--text-secondary);
    }

    .audit-subtitle code {
      background: var(--surface);
      padding: 2px 8px;
      border-radius: 6px;
      font-size: 0.82rem;
    }

    /* ── Score Gauge ─────────────────────── */
    .gauge-container {
      position: relative;
      display: inline-block;
      width: 140px;
      height: 140px;
      margin: 24px 0 16px;
    }

    .gauge-container svg { display: block; width: 100%; height: 100%; }
    .gauge-bg { stroke: rgba(255,255,255,0.06); }
    .gauge-fill {
      stroke: ${avgColor};
      stroke-dasharray: 283;
      stroke-dashoffset: ${dashOffset};
      transition: stroke-dashoffset 1.2s ease-out;
      transform: rotate(-90deg);
      transform-origin: center;
    }

    .gauge-text {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      text-align: center;
    }

    .gauge-score {
      font-size: 2.2rem;
      font-weight: 800;
      letter-spacing: -0.03em;
      color: ${avgColor};
      line-height: 1;
    }

    .gauge-label {
      font-size: 0.7rem;
      color: var(--text-muted);
      margin-top: 2px;
    }

    /* ── Summary Cards ───────────────────── */
    .summary-cards {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
      gap: 12px;
      margin: 24px 0 32px;
    }

    .summary-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 16px;
      text-align: center;
      transition: border-color 0.2s;
    }

    .summary-card:hover { border-color: rgba(255,255,255,0.15); }

    .summary-card-value {
      font-size: 1.5rem;
      font-weight: 700;
      line-height: 1;
      margin-bottom: 4px;
    }

    .summary-card-label {
      font-size: 0.72rem;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    /* ── Dependencies Table ──────────────── */
    .deps-section {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 24px;
      margin-bottom: 24px;
    }

    .deps-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
    }

    .deps-header h2 {
      font-size: 1rem;
      font-weight: 600;
      color: var(--text-secondary);
    }

    .deps-sort {
      display: flex;
      gap: 8px;
    }

    .sort-btn {
      background: none;
      border: 1px solid var(--border);
      color: var(--text-muted);
      padding: 4px 12px;
      border-radius: 8px;
      font-size: 0.72rem;
      font-family: 'Inter', sans-serif;
      cursor: pointer;
      transition: all 0.2s;
    }

    .sort-btn:hover { border-color: rgba(255,255,255,0.2); color: var(--text-secondary); }
    .sort-btn.active { border-color: var(--accent); color: var(--accent); }

    .deps-table {
      width: 100%;
      border-collapse: collapse;
    }

    .deps-table th {
      text-align: left;
      font-size: 0.72rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--text-muted);
      padding: 8px 0;
      border-bottom: 1px solid var(--border);
    }

    .deps-table th:nth-child(2),
    .deps-table th:nth-child(4) { text-align: center; }

    .dep-row {
      transition: background 0.15s;
    }

    .dep-row:hover { background: var(--surface-hover); }

    .dep-row td {
      padding: 10px 0;
      border-bottom: 1px solid rgba(255,255,255,0.03);
      font-size: 0.85rem;
    }

    .dep-name {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }

    .dep-name-text { font-weight: 500; }

    .dep-version {
      font-size: 0.72rem;
      color: var(--text-muted);
      font-family: 'SF Mono', 'Fira Code', monospace;
    }

    .dev-badge {
      font-size: 0.65rem;
      background: rgba(139,139,158,0.15);
      color: var(--text-muted);
      padding: 1px 6px;
      border-radius: 4px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }

    .dep-score {
      text-align: center;
      font-weight: 700;
      font-size: 0.9rem;
    }

    .dep-verdict {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 0.82rem;
    }

    .verdict-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      flex-shrink: 0;
    }

    .dep-action { text-align: center; }

    .dep-link {
      color: var(--accent);
      text-decoration: none;
      font-weight: 600;
      font-size: 1rem;
      transition: opacity 0.2s;
    }

    .dep-link:hover { opacity: 0.7; }

    .unresolved-hint {
      color: var(--text-muted);
      cursor: help;
      font-size: 0.85rem;
    }

    /* ── Dev deps toggle ─────────────────── */
    .dev-toggle {
      background: none;
      border: 1px solid var(--border);
      color: var(--text-secondary);
      padding: 8px 16px;
      border-radius: 10px;
      font-family: 'Inter', sans-serif;
      font-size: 0.82rem;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 6px;
      margin-top: 16px;
      transition: all 0.2s;
      width: 100%;
      justify-content: center;
    }

    .dev-toggle:hover { border-color: rgba(255,255,255,0.2); }

    .dev-deps-content {
      display: none;
      margin-top: 12px;
    }

    .dev-deps-content.visible { display: block; }

    .dev-toggle .arrow {
      transition: transform 0.2s;
      display: inline-block;
    }

    .dev-toggle.expanded .arrow { transform: rotate(90deg); }

    /* ── CTA Section ─────────────────────── */
    .cta-section {
      background: linear-gradient(135deg, rgba(99,102,241,0.08) 0%, rgba(139,92,246,0.08) 100%);
      border: 1px solid rgba(99,102,241,0.2);
      border-radius: 16px;
      padding: 32px;
      text-align: center;
      margin-bottom: 24px;
    }

    .cta-section h2 {
      font-size: 1.2rem;
      font-weight: 700;
      margin-bottom: 8px;
    }

    .cta-section p {
      color: var(--text-secondary);
      font-size: 0.9rem;
      margin-bottom: 20px;
      max-width: 460px;
      margin-left: auto;
      margin-right: auto;
      line-height: 1.5;
    }

    .cta-btn {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background: var(--accent);
      color: #fff;
      text-decoration: none;
      padding: 12px 28px;
      border-radius: 12px;
      font-weight: 600;
      font-size: 0.9rem;
      transition: all 0.2s;
    }

    .cta-btn:hover { background: #5558e6; transform: translateY(-1px); }

    .cta-sub {
      margin-top: 12px;
      font-size: 0.75rem;
      color: var(--text-muted);
    }

    /* ── Share / Embed ───────────────────── */
    .embed-section {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 24px;
      margin-bottom: 28px;
    }

    .embed-section h2 {
      font-size: 1rem;
      font-weight: 600;
      margin-bottom: 16px;
      color: var(--text-secondary);
    }

    .embed-row { margin-bottom: 14px; }
    .embed-row:last-child { margin-bottom: 0; }

    .embed-label {
      font-size: 0.72rem;
      color: var(--text-muted);
      margin-bottom: 6px;
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .embed-code {
      background: rgba(0,0,0,0.3);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 12px 16px;
      font-family: 'SF Mono', 'Fira Code', monospace;
      font-size: 0.75rem;
      color: var(--text-secondary);
      word-break: break-all;
      cursor: pointer;
      transition: border-color 0.2s;
      position: relative;
    }

    .embed-code:hover { border-color: var(--accent); }

    .embed-code .copy-hint {
      position: absolute;
      right: 12px;
      top: 50%;
      transform: translateY(-50%);
      font-size: 0.7rem;
      color: var(--text-muted);
      opacity: 0;
      transition: opacity 0.2s;
    }

    .embed-code:hover .copy-hint { opacity: 1; }

    /* ── Incomplete notice ───────────────── */
    .incomplete-notice {
      background: rgba(234,179,8,0.08);
      border: 1px solid rgba(234,179,8,0.2);
      color: #fbbf24;
      padding: 12px 20px;
      border-radius: 12px;
      font-size: 0.85rem;
      margin-bottom: 24px;
      text-align: center;
    }

    /* ── Responsive ──────────────────────── */
    @media (max-width: 640px) {
      .container { padding: 0 16px; }
      .audit-hero { padding: 24px 0 28px; }
      .audit-title { font-size: 1.3rem; }
      .summary-cards { grid-template-columns: repeat(2, 1fr); }
      .deps-section { padding: 16px; }
      .deps-table th:nth-child(3),
      .dep-verdict { display: none; }
      .dep-row td { padding: 8px 0; font-size: 0.8rem; }
      .cta-section { padding: 24px 16px; }
      .gauge-container { width: 110px; height: 110px; }
      .gauge-score { font-size: 1.8rem; }
    }
  </style>
</head>
<body>
  <div class="bg-orb bg-orb-1"></div>
  <div class="bg-orb bg-orb-2"></div>

  ${navbarHtml}

  <div class="container">

    <section class="audit-hero">
      <h1 class="audit-title">Dependency Health Audit</h1>
      <p class="audit-subtitle">
        <code>${escapeHtml(formatLabel)}</code> · ${result.total} dependencies · hash <code>${shortHash}…</code>
      </p>

      <div class="gauge-container">
        <svg viewBox="0 0 100 100">
          <circle class="gauge-bg" cx="50" cy="50" r="45" fill="none" stroke-width="8"/>
          <circle class="gauge-fill" cx="50" cy="50" r="45" fill="none" stroke-width="8" stroke-linecap="round"/>
        </svg>
        <div class="gauge-text">
          <div class="gauge-score">${avgScore}</div>
          <div class="gauge-label">avg score</div>
        </div>
      </div>
    </section>

    <div class="summary-cards">
      <div class="summary-card">
        <div class="summary-card-value" style="color: var(--green)">${result.summary.healthy}</div>
        <div class="summary-card-label">✅ Healthy</div>
      </div>
      <div class="summary-card">
        <div class="summary-card-value" style="color: var(--yellow)">${result.summary.stable}</div>
        <div class="summary-card-label">🟡 Stable</div>
      </div>
      <div class="summary-card">
        <div class="summary-card-value" style="color: var(--orange)">${result.summary.degraded}</div>
        <div class="summary-card-label">⚠️ Degraded</div>
      </div>
      <div class="summary-card">
        <div class="summary-card-value" style="color: var(--red)">${result.summary.critical + result.summary.unmaintained}</div>
        <div class="summary-card-label">🔴 At Risk</div>
      </div>
    </div>

    ${!result.complete ? `
    <div class="incomplete-notice">
      ⏳ ${result.pending} dependencies are still being scored in the background.
      Refresh in a few seconds for the full report.
    </div>
    ` : ''}

    <section class="deps-section">
      <div class="deps-header">
        <h2>Dependencies (${prodDeps.length})</h2>
        <div class="deps-sort">
          <button class="sort-btn active" onclick="sortDeps('score-asc')" id="sortScoreAsc">Score ↑</button>
          <button class="sort-btn" onclick="sortDeps('score-desc')" id="sortScoreDesc">Score ↓</button>
          <button class="sort-btn" onclick="sortDeps('name')" id="sortName">A–Z</button>
        </div>
      </div>
      <table class="deps-table" id="prodTable">
        <thead>
          <tr>
            <th>Dependency</th>
            <th>Score</th>
            <th>Verdict</th>
            <th></th>
          </tr>
        </thead>
        <tbody id="prodBody">
          ${prodRows}
        </tbody>
      </table>

      ${devDeps.length > 0 ? `
      <button class="dev-toggle" id="devToggle" onclick="toggleDevDeps()">
        <span class="arrow">▶</span> Dev Dependencies (${devDeps.length})
      </button>
      <div class="dev-deps-content" id="devDepsContent">
        <table class="deps-table" id="devTable">
          <thead>
            <tr>
              <th>Dependency</th>
              <th>Score</th>
              <th>Verdict</th>
              <th></th>
            </tr>
          </thead>
          <tbody id="devBody">
            ${devRows}
          </tbody>
        </table>
      </div>
      ` : ''}
    </section>

    <section class="cta-section">
      <h2>🚀 Automate this in CI</h2>
      <p>Add dependency health checks to every pull request with the IsItAlive GitHub Action. Zero config for public repos.</p>
      <a href="https://github.com/isitalive/audit-action" class="cta-btn" target="_blank" rel="noopener">
        Get Started →
      </a>
      <div class="cta-sub">Free for public repos · No API key needed · Powered by OIDC</div>
    </section>

    <section class="embed-section">
      <h2>Share & Embed</h2>
      <div class="embed-row">
        <div class="embed-label">Shareable URL</div>
        <div class="embed-code" onclick="copyText(this)" data-text="${hashUrl}">
          ${hashUrl}
          <span class="copy-hint">click to copy</span>
        </div>
      </div>
      <div class="embed-row">
        <div class="embed-label">API (JSON)</div>
        <div class="embed-code" onclick="copyText(this)" data-text="${apiUrl}">
          GET ${apiUrl}
          <span class="copy-hint">click to copy</span>
        </div>
      </div>
    </section>

  </div>

  ${footerHtml}

  <script>
    function copyText(el) {
      var text = el.getAttribute('data-text');
      navigator.clipboard.writeText(text).then(function() {
        var hint = el.querySelector('.copy-hint');
        if (hint) {
          hint.textContent = 'copied!';
          hint.style.opacity = '1';
          hint.style.color = '#22c55e';
          setTimeout(function() {
            hint.textContent = 'click to copy';
            hint.style.color = '';
            hint.style.opacity = '';
          }, 1500);
        }
      });
    }

    function sortDeps(mode) {
      var tbody = document.getElementById('prodBody');
      if (!tbody) return;
      var rows = Array.from(tbody.querySelectorAll('.dep-row'));

      rows.sort(function(a, b) {
        var sa = parseInt(a.dataset.score, 10);
        var sb = parseInt(b.dataset.score, 10);
        if (mode === 'score-asc') return sa - sb;
        if (mode === 'score-desc') return sb - sa;
        // name
        return a.querySelector('.dep-name-text').textContent
          .localeCompare(b.querySelector('.dep-name-text').textContent);
      });

      rows.forEach(function(r) { tbody.appendChild(r); });

      // Update button states
      document.querySelectorAll('.sort-btn').forEach(function(b) { b.classList.remove('active'); });
      if (mode === 'score-asc') document.getElementById('sortScoreAsc').classList.add('active');
      if (mode === 'score-desc') document.getElementById('sortScoreDesc').classList.add('active');
      if (mode === 'name') document.getElementById('sortName').classList.add('active');
    }

    function toggleDevDeps() {
      var content = document.getElementById('devDepsContent');
      var toggle = document.getElementById('devToggle');
      if (!content || !toggle) return;
      var visible = content.classList.toggle('visible');
      toggle.classList.toggle('expanded', visible);
    }
  </script>
  ${analyticsScript(analyticsToken)}
</body>
</html>`
}
