// ---------------------------------------------------------------------------
// Audit result page — dependency health report with drilldown
//
// Reads from cached audit data (KV: audit:result:{hash}).
// Shareable via /audit/{hash} — pure read of cached data.
//
// UX: score-first, deps collapsed by default.
// Only "Needs Attention" deps visible initially.
// ---------------------------------------------------------------------------

import type { AuditResult, AuditDep } from '../audit/scorer'
import { navbarHtml, footerHtml, componentCss, themeCss, themeScript, themeHeadScript } from './components'
import { escapeHtml } from './error'
import { ogTags } from './og'
import { analyticsScript } from './analytics'

const VERDICT_COLORS: Record<string, string> = {
  healthy: '#22c55e',
  stable: '#eab308',
  degraded: '#f97316',
  critical: '#ef4444',
  unmaintained: '#6b7280',
  pending: '#9d9db5',
  unresolved: '#64648a',
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

/** Build a GitHub "create new file" URL that pre-fills the workflow YAML */
function installActionUrl(repoOwner?: string, repoName?: string): string {
  const yaml = `name: Dependency Health Audit
on:
  pull_request:
    paths: ['package.json', 'go.mod']
permissions:
  contents: read
  pull-requests: write
  id-token: write
jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: isitalive/audit-action@v1
`
  if (repoOwner && repoName) {
    return `https://github.com/${encodeURIComponent(repoOwner)}/${encodeURIComponent(repoName)}/new?filename=.github/workflows/isitalive.yml&value=${encodeURIComponent(yaml)}`
  }
  // Fallback if no repo context
  return `https://github.com/isitalive/audit-action`
}

export function auditResultPage(result: AuditResult, analyticsToken?: string, repoOwner?: string, repoName?: string): string {
  const avgScore = result.summary.avgScore
  const avgColor = scoreColor(avgScore)
  const avgVerdict = avgScoreVerdict(avgScore)
  const dashOffset = 283 - (283 * avgScore) / 100
  const shortHash = result.auditHash.slice(0, 12)

  // Separate prod and dev deps
  const prodDeps = result.dependencies.filter(d => !d.dev)
  const devDeps = result.dependencies.filter(d => d.dev)

  // Split prod deps into groups
  const needsAttention = prodDeps.filter(d => ['degraded', 'critical', 'unmaintained'].includes(d.verdict))
  const okDeps = prodDeps.filter(d => ['healthy', 'stable'].includes(d.verdict))
  const pendingDeps = prodDeps.filter(d => ['pending', 'unresolved'].includes(d.verdict))

  const needsAttentionRows = needsAttention.map(renderDepRow).join('')
  const okRows = okDeps.map(renderDepRow).join('')
  const pendingRows = pendingDeps.map(renderDepRow).join('')
  const devRows = devDeps.map(renderDepRow).join('')

  const formatLabel = result.format === 'package.json' ? 'package.json' : 'go.mod'

  const hashUrl = `https://isitalive.dev/audit/${result.auditHash}`
  const apiUrl = `curl -X POST https://isitalive.dev/api/manifest -H 'X-Manifest-Hash: ${result.auditHash}'`
  const installUrl = installActionUrl(repoOwner, repoName)

  // Verdict emoji for the gauge area
  const verdictEmoji: Record<string, string> = {
    healthy: '🟢', stable: '🟡', degraded: '🟠', critical: '🔴', unmaintained: '⚫'
  }
  const verdictLabels: Record<string, string> = {
    healthy: 'Healthy', stable: 'Stable', degraded: 'Degraded', critical: 'Critical', unmaintained: 'Unmaintained'
  }

  return `<!DOCTYPE html>
<html lang="en" data-theme="system">
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
      transition: background 0.3s, color 0.3s;
    }

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
      background: transparent;
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
    .gauge-bg { stroke: var(--surface); }
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

    .verdict-badge-audit {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: ${avgColor}18;
      border: 1px solid ${avgColor}30;
      color: ${avgColor};
      padding: 6px 16px;
      border-radius: 4px;
      font-size: 0.85rem;
      font-weight: 600;
      margin-top: 8px;
    }

    /* ── Summary Cards (clickable filter) ── */
    .deps-summary-card {
      cursor: pointer;
      position: relative;
    }
    .deps-summary-card.active {
      border-color: var(--accent);
      box-shadow: 0 0 0 1px var(--accent);
    }
    .deps-summary-card.active::after {
      content: '✕';
      position: absolute;
      top: 6px;
      right: 8px;
      font-size: 0.6rem;
      color: var(--text-muted);
    }




    /* ── Share / Embed ───────────────────── */
    .embed-section {
      background: transparent;
      border: 1px solid var(--border);
      border-radius: 6px;
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
      background: transparent;
      border: 1px solid var(--border);
      border-radius: 4px;
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

    /* ── Responsive ──────────────────────── */
    @media (max-width: 640px) {
      .container { padding: 0 16px; }
      .audit-hero { padding: 24px 0 28px; }
      .audit-title { font-size: 1.3rem; }
      .gauge-container { width: 110px; height: 110px; }
      .gauge-score { font-size: 1.8rem; }
      .install-cta { flex-direction: column; text-align: center; padding: 24px 20px; }
      .install-cta-btn { width: 100%; justify-content: center; }
    }
  </style>
</head>
<body>

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
      <div>
        <span class="verdict-badge-audit">${verdictEmoji[avgVerdict] || '🟡'} ${verdictLabels[avgVerdict] || 'Unknown'}</span>
      </div>
    </section>

    <div class="deps-summary-cards" id="summaryCards">
      <button type="button" class="deps-summary-card" data-filter="healthy">
        <div class="deps-summary-card-value" style="color: var(--green)">${result.summary.healthy}</div>
        <div class="deps-summary-card-label">✅ Healthy</div>
      </button>
      <button type="button" class="deps-summary-card" data-filter="stable">
        <div class="deps-summary-card-value" style="color: var(--yellow)">${result.summary.stable}</div>
        <div class="deps-summary-card-label">🟡 Stable</div>
      </button>
      <button type="button" class="deps-summary-card" data-filter="degraded">
        <div class="deps-summary-card-value" style="color: var(--orange)">${result.summary.degraded}</div>
        <div class="deps-summary-card-label">⚠️ Degraded</div>
      </button>
      <button type="button" class="deps-summary-card" data-filter="at-risk">
        <div class="deps-summary-card-value" style="color: var(--red)">${result.summary.critical + result.summary.unmaintained}</div>
        <div class="deps-summary-card-label">🔴 At Risk</div>
      </button>
    </div>

    ${!result.complete ? `
    <div class="deps-incomplete-notice">
      ⏳ ${result.pending} dependencies are still being scored in the background.
      Refresh in a few seconds for the full report.
    </div>
    ` : ''}

    <div class="deps-section-card">
      <input type="text" class="deps-search" id="depsSearch" placeholder="Search dependencies…" autocomplete="off" />

      ${needsAttention.length > 0 ? `
      <div class="deps-group" id="groupAttention">
        <button class="deps-group-toggle expanded" data-target="attentionContent" aria-expanded="true">
          <span class="arrow">▶</span>
          ⚠️ Needs Attention<span class="deps-group-count">(${needsAttention.length})</span>
        </button>
        <div class="deps-group-content visible" id="attentionContent">
          <table class="deps-table">
            <thead><tr><th>Dependency</th><th>Score</th><th>Verdict</th><th></th></tr></thead>
            <tbody>${needsAttentionRows}</tbody>
          </table>
        </div>
      </div>
      ` : ''}

      ${okDeps.length > 0 ? `
      <div class="deps-group" id="groupOk">
        <button class="deps-group-toggle" data-target="okContent" aria-expanded="false">
          <span class="arrow">▶</span>
          ✅ Healthy & Stable<span class="deps-group-count">(${okDeps.length})</span>
        </button>
        <div class="deps-group-content" id="okContent">
          <table class="deps-table">
            <thead><tr><th>Dependency</th><th>Score</th><th>Verdict</th><th></th></tr></thead>
            <tbody>${okRows}</tbody>
          </table>
        </div>
      </div>
      ` : ''}

      ${pendingDeps.length > 0 ? `
      <div class="deps-group" id="groupPending">
        <button class="deps-group-toggle" data-target="pendingContent" aria-expanded="false">
          <span class="arrow">▶</span>
          ⏳ Pending / Unresolved<span class="deps-group-count">(${pendingDeps.length})</span>
        </button>
        <div class="deps-group-content" id="pendingContent">
          <table class="deps-table">
            <thead><tr><th>Dependency</th><th>Score</th><th>Verdict</th><th></th></tr></thead>
            <tbody>${pendingRows}</tbody>
          </table>
        </div>
      </div>
      ` : ''}

      ${devDeps.length > 0 ? `
      <div class="deps-group" id="groupDev">
        <button class="deps-group-toggle" data-target="devContent" aria-expanded="false">
          <span class="arrow">▶</span>
          🔧 Dev Dependencies<span class="deps-group-count">(${devDeps.length})</span>
        </button>
        <div class="deps-group-content" id="devContent">
          <table class="deps-table">
            <thead><tr><th>Dependency</th><th>Score</th><th>Verdict</th><th></th></tr></thead>
            <tbody>${devRows}</tbody>
          </table>
        </div>
      </div>
      ` : ''}
    </div>

    <div class="install-cta">
      <div class="install-cta-text">
        <h2>🚀 Automate this in CI</h2>
        <p>Add dependency health checks to every pull request. Zero config for public repos.</p>
        <div class="install-cta-sub">Free for public repos · No API key needed · Powered by OIDC</div>
      </div>
      <a href="${escapeHtml(installUrl)}" class="install-cta-btn" target="_blank" rel="noopener">
        Install Action →
      </a>
    </div>

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

    // ── Collapsible groups ──────────────────────────────────
    document.querySelectorAll('.deps-group-toggle').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var targetId = btn.getAttribute('data-target');
        var content = document.getElementById(targetId);
        if (!content) return;
        var visible = content.classList.toggle('visible');
        btn.classList.toggle('expanded', visible);
        btn.setAttribute('aria-expanded', visible ? 'true' : 'false');
      });
    });

    // ── Composing search + verdict filter ───────────────────
    var activeFilter = null;
    var searchQuery = '';

    function applyFilters() {
      document.querySelectorAll('.dep-row').forEach(function(row) {
        var name = row.querySelector('.dep-name-text');
        var verdict = row.getAttribute('data-verdict');

        var matchesSearch = !searchQuery || (name && name.textContent.toLowerCase().indexOf(searchQuery) !== -1);

        var matchesVerdict = true;
        if (activeFilter) {
          var verdicts = [];
          if (activeFilter === 'healthy') verdicts = ['healthy'];
          else if (activeFilter === 'stable') verdicts = ['stable'];
          else if (activeFilter === 'degraded') verdicts = ['degraded'];
          else if (activeFilter === 'at-risk') verdicts = ['critical', 'unmaintained'];
          matchesVerdict = verdicts.indexOf(verdict) !== -1;
        }

        row.style.display = (matchesSearch && matchesVerdict) ? '' : 'none';
      });
    }

    // ── Search filter ───────────────────────────────────────
    var searchInput = document.getElementById('depsSearch');
    if (searchInput) {
      searchInput.addEventListener('input', function() {
        searchQuery = this.value.toLowerCase();
        applyFilters();
        if (searchQuery.length > 0) {
          document.querySelectorAll('.deps-group-content').forEach(function(c) { c.classList.add('visible'); });
          document.querySelectorAll('.deps-group-toggle').forEach(function(b) {
            b.classList.add('expanded');
            b.setAttribute('aria-expanded', 'true');
          });
        }
      });
    }

    // ── Clickable summary cards (filter) ────────────────────
    document.querySelectorAll('.deps-summary-card[data-filter]').forEach(function(card) {
      card.addEventListener('click', function() {
        var filter = card.getAttribute('data-filter');

        if (activeFilter === filter) {
          activeFilter = null;
          document.querySelectorAll('.deps-summary-card').forEach(function(c) { c.classList.remove('active'); });
        } else {
          activeFilter = filter;
          document.querySelectorAll('.deps-summary-card').forEach(function(c) { c.classList.remove('active'); });
          card.classList.add('active');
        }

        applyFilters();

        // Auto-expand groups containing matching rows
        document.querySelectorAll('.deps-group').forEach(function(group) {
          var hasVisible = group.querySelector('.dep-row:not([style*="display: none"])');
          var content = group.querySelector('.deps-group-content');
          var toggle = group.querySelector('.deps-group-toggle');
          if (hasVisible && content && toggle) {
            content.classList.add('visible');
            toggle.classList.add('expanded');
            toggle.setAttribute('aria-expanded', 'true');
          }
        });
      });
    });
  </script>
  ${themeScript}
  ${analyticsScript(analyticsToken)}
</body>
</html>`
}
