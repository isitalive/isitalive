// ---------------------------------------------------------------------------
// Result page HTML — shows score gauge, verdict, signal breakdown
// Dashboard grid layout: Hero → 2-col (History+DepSummary | Signals+Actions) → CTA → Deps
// ---------------------------------------------------------------------------

import type { ScoringResult, Verdict, ProjectMetadata } from '../scoring/types';
import { navbarHtml, footerHtml, componentCss, themeCss, themeScript, themeHeadScript } from './components';
import { escapeHtml } from './error';
import { ogTags } from './og';
import { analyticsScript } from './analytics';
import type { Trend } from '../ingest/processor';

const VERDICT_COLORS: Record<Verdict, string> = {
  healthy: '#22c55e',
  stable: '#eab308',
  degraded: '#f97316',
  critical: '#ef4444',
  unmaintained: '#6b7280',
};

const VERDICT_EMOJI: Record<Verdict, string> = {
  healthy: '🟢',
  stable: '🟡',
  degraded: '🟠',
  critical: '🔴',
  unmaintained: '⚫',
};

const VERDICT_LABELS: Record<Verdict, string> = {
  healthy: 'Healthy',
  stable: 'Stable',
  degraded: 'Degraded',
  critical: 'Critical',
  unmaintained: 'Unmaintained',
};

/** Normalize legacy verdict values from KV cache */
const VERDICT_NORMALIZE: Record<string, Verdict> = {
  declining: 'degraded',
  inactive: 'degraded',
  stale: 'degraded',
  at_risk: 'critical',
  dormant: 'critical',
  abandoned: 'unmaintained',
  maintained: 'stable',
};
function normalizeVerdict(v: string): Verdict {
  return (VERDICT_NORMALIZE[v] as Verdict) || (v as Verdict);
}

function signalBar(score: number, color: string): string {
  return `<div style="
    width: 100%;
    height: 4px;
    background: transparent;
    border-radius: 2px;
    overflow: hidden;
  "><div style="
    width: ${score}%;
    height: 100%;
    background: ${color};
    border-radius: 2px;
    transition: width 0.8s ease;
  "></div></div>`;
}

function scoreColor(score: number): string {
  if (score >= 80) return '#22c55e';
  if (score >= 60) return '#eab308';
  if (score >= 40) return '#f97316';
  if (score >= 20) return '#ef4444';
  return '#6b7280';
}

function formatNumber(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  return String(n);
}

function renderMetadataCard(meta: ProjectMetadata | undefined, owner: string, repo: string, firstIndexed?: string | null): string {
  if (!meta) return '';

  const pills: string[] = [];
  const safeOwner = escapeHtml(owner);
  const safeRepo = escapeHtml(repo);
  const ghUrl = `https://github.com/${safeOwner}/${safeRepo}`;

  // Language
  if (meta.language) {
    const dotColor = escapeHtml(meta.languageColor || '#9d9db5');
    pills.push(`<span class="meta-pill"><span class="lang-dot" style="background:${dotColor}"></span>${escapeHtml(meta.language)}</span>`);
  }

  // License
  if (meta.license && meta.license !== 'NOASSERTION') {
    pills.push(`<span class="meta-pill">© ${escapeHtml(meta.license)}</span>`);
  }

  // Website
  if (meta.homepageUrl) {
    const display = meta.homepageUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');
    pills.push(`<a class="meta-pill" href="${escapeHtml(meta.homepageUrl)}" target="_blank" rel="noopener">🌐 ${escapeHtml(display)}</a>`);
  }

  // Repo link
  pills.push(`<a class="meta-pill" href="${ghUrl}" target="_blank" rel="noopener">GitHub</a>`);

  // Stars & forks
  pills.push(`<span class="meta-pill">⭐ ${formatNumber(meta.stars)}</span>`);
  pills.push(`<span class="meta-pill">🍴 ${formatNumber(meta.forks)}</span>`);

  // First indexed date
  if (firstIndexed) {
    const date = escapeHtml(firstIndexed.split('T')[0]);
    pills.push(`<span class="meta-pill">📅 Tracking since ${date}</span>`);
  }

  return `
    <section class="meta-card">
      ${meta.description ? `<div class="meta-description">${escapeHtml(meta.description)}</div>` : ''}
      <div class="meta-pills">
        ${pills.join('\n        ')}
      </div>
    </section>`;
}

/** Build the Install Action CTA URL */
function installActionUrl(owner: string, repo: string): string {
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
`;
  return `https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/new/main?filename=.github/workflows/isitalive.yml&value=${encodeURIComponent(yaml)}`;
}

export function resultPage(result: ScoringResult, rawOwner: string, rawRepo: string, analyticsToken?: string, firstIndexed?: string | null, trend?: Trend | null): string {
  const owner = escapeHtml(rawOwner);
  const repo = escapeHtml(rawRepo);
  const verdict = normalizeVerdict(result.verdict);
  const color = VERDICT_COLORS[verdict];
  const emoji = VERDICT_EMOJI[verdict];
  const label = VERDICT_LABELS[verdict];
  const dashOffset = 283 - (283 * result.score) / 100; // for SVG circle gauge

  // Trend display
  const TREND_ICONS: Record<string, string> = { improving: '↗', stable: '→', declining: '↘' };
  const TREND_COLORS: Record<string, string> = { improving: '#22c55e', stable: '#9d9db5', declining: '#ef4444' };
  const TREND_LABELS: Record<string, string> = { improving: 'Improving', stable: 'Stable', declining: 'Declining' };

  let trendHtml = '';
  if (trend) {
    if (trend.direction) {
      const tIcon = TREND_ICONS[trend.direction];
      const tColor = TREND_COLORS[trend.direction];
      const tLabel = TREND_LABELS[trend.direction];
      const deltaStr = trend.delta > 0 ? `+${trend.delta}` : `${trend.delta}`;
      trendHtml = `<span class="trend-pill" style="color: ${tColor}; border-color: ${tColor}33">${tIcon} ${tLabel} <span class="trend-delta">${deltaStr} pts over ${trend.daySpan}d</span></span>`;
    } else {
      trendHtml = `<span class="trend-pill trend-collecting">📊 Collecting trend data (${trend.dataPoints} point${trend.dataPoints !== 1 ? 's' : ''}, need ${trend.minDaysRequired}d span)</span>`;
    }
  }

  // Compact signal rows for grid (2 columns of signal pairs)
  const signalsHtml = result.signals.map(s => `
    <div class="signal-row">
      <div class="signal-header">
        <span class="signal-name">${escapeHtml(s.label)}</span>
        <span class="signal-score" style="color: ${scoreColor(s.score)}">${s.score}</span>
      </div>
      ${signalBar(s.score, scoreColor(s.score))}
    </div>
  `).join('');

  const encodedOwner = encodeURIComponent(rawOwner);
  const encodedRepo = encodeURIComponent(rawRepo);
  const badgeUrl = `https://isitalive.dev/api/badge/github/${encodedOwner}/${encodedRepo}`;
  const apiUrl = `https://isitalive.dev/api/check/github/${owner}/${repo}`;
  const githubUrl = `https://github.com/${owner}/${repo}`;
  const ctaUrl = installActionUrl(rawOwner, rawRepo);

  return `<!DOCTYPE html>
<html lang="en" data-theme="system">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
  <title>${owner}/${repo} — Is It Alive?</title>
  <meta name="description" content="${owner}/${repo} health score: ${result.score}/100 (${label}). Checked by Is It Alive?">
  ${ogTags({
    title: `${rawOwner}/${rawRepo} — Is It Alive?`,
    description: `${rawOwner}/${rawRepo} health score: ${result.score}/100 (${label}). Checked by Is It Alive?`,
    url: `https://isitalive.dev/github/${encodedOwner}/${encodedRepo}`,
    image: badgeUrl,
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

    /* ── Score Hero ───────────────────────── */
    .hero {
      text-align: center;
      padding: 40px 0 24px;
    }

    .project-name {
      font-size: 0.9rem;
      color: var(--text-secondary);
      margin-bottom: 6px;
    }

    .project-name a {
      color: var(--text-secondary);
      text-decoration: none;
      border-bottom: 1px dashed var(--border);
      transition: color 0.2s;
    }

    .project-name a:hover { color: var(--accent); }

    .gauge-container {
      position: relative;
      display: inline-block;
      width: 160px;
      height: 160px;
      margin: 20px 0 16px;
    }

    .gauge-container svg {
      display: block;
      width: 100%;
      height: 100%;
    }

    .gauge-bg { stroke: var(--surface); }
    .gauge-fill {
      stroke: ${color};
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
      font-size: 2.6rem;
      font-weight: 800;
      letter-spacing: -0.03em;
      color: ${color};
      line-height: 1;
    }

    .gauge-label {
      font-size: 0.75rem;
      color: var(--text-muted);
      margin-top: 4px;
    }

    .verdict-badge {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background: ${color}18;
      border: 1px solid ${color}30;
      color: ${color};
      padding: 8px 20px;
      border-radius: 4px;
      font-size: 0.9rem;
      font-weight: 600;
    }

    ${result.overrideReason ? `
    .override-notice {
      margin-top: 16px;
      background: rgba(239,68,68,0.08);
      border: 1px solid rgba(239,68,68,0.2);
      color: #fca5a5;
      padding: 12px 20px;
      border-radius: 6px;
      font-size: 0.82rem;
    }
    ` : ''}

    ${result.cached ? `
    .cache-notice {
      margin-top: 10px;
      font-size: 0.72rem;
      color: var(--text-muted);
    }
    ` : ''}

    /* ── Dashboard Grid ─────────────────── */
    .dashboard-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
      margin-bottom: 20px;
    }

    .dash-card {
      background: transparent;
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 24px;
    }

    .dash-card h2 {
      font-size: 0.85rem;
      font-weight: 600;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 16px;
    }

    /* ── Signals (compact) ───────────────── */
    .signals-grid {
      display: grid;
      gap: 12px;
    }

    .signal-row { margin-bottom: 0; }

    .signal-header {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      margin-bottom: 4px;
    }

    .signal-name {
      font-size: 0.8rem;
      font-weight: 500;
    }

    .signal-score {
      font-size: 0.8rem;
      font-weight: 700;
    }

    /* ── Dep Summary (2x2 mini-grid) ─────── */
    .dep-summary-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
    }

    .dep-summary-box {
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 14px;
      text-align: center;
      cursor: pointer;
      transition: border-color 0.2s;
    }
    .dep-summary-box:hover { border-color: var(--text-muted); }
    .dep-summary-box-value {
      font-size: 1.6rem;
      font-weight: 700;
      line-height: 1;
      margin-bottom: 4px;
    }
    .dep-summary-box-label {
      font-size: 0.7rem;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }

    /* ── Get Started (compact embed) ─────── */
    .embed-row { margin-bottom: 12px; }
    .embed-row:last-child { margin-bottom: 0; }

    .embed-label {
      font-size: 0.7rem;
      color: var(--text-muted);
      margin-bottom: 4px;
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .embed-code {
      background: transparent;
      border: 1px solid var(--border);
      border-radius: 4px;
      padding: 10px 14px;
      font-family: 'SF Mono', 'Fira Code', monospace;
      font-size: 0.7rem;
      color: var(--text-secondary);
      word-break: break-all;
      cursor: pointer;
      transition: border-color 0.2s;
      position: relative;
    }

    .embed-code:hover { border-color: var(--accent); }

    .embed-code .copy-hint {
      position: absolute;
      right: 10px;
      top: 50%;
      transform: translateY(-50%);
      font-size: 0.65rem;
      color: var(--text-muted);
      opacity: 0;
      transition: opacity 0.2s;
    }

    .embed-code:hover .copy-hint { opacity: 1; }

    /* ── Metadata Card ──────────────────── */
    .meta-card {
      background: transparent;
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 20px 24px;
      margin-bottom: 20px;
    }

    .meta-description {
      font-size: 0.88rem;
      color: var(--text-secondary);
      line-height: 1.5;
      margin-bottom: 12px;
    }

    .meta-pills {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
    }

    .meta-pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: var(--surface-hover);
      border: 1px solid var(--border);
      border-radius: 4px;
      padding: 5px 14px;
      font-size: 0.78rem;
      color: var(--text-secondary);
      text-decoration: none;
      transition: border-color 0.2s, color 0.2s;
    }

    a.meta-pill:hover {
      border-color: var(--accent);
      color: var(--text-primary);
    }

    .lang-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      display: inline-block;
      flex-shrink: 0;
    }

    /* ── Trend ──────────────────────────── */
    .trend-pill {
      display: inline-block;
      margin-top: 10px;
      padding: 4px 14px;
      border: 1px solid;
      border-radius: 4px;
      font-size: 0.78rem;
      font-weight: 600;
    }
    .trend-delta {
      font-weight: 400;
      opacity: 0.7;
      margin-left: 4px;
    }
    .trend-collecting {
      color: var(--text-muted);
      border-color: var(--border);
      font-weight: 400;
    }

    /* ── Responsive ──────────────────────── */
    @media (max-width: 768px) {
      .dashboard-grid {
        grid-template-columns: 1fr;
      }
    }
    @media (max-width: 640px) {
      .hero { padding: 24px 0 20px; }
      .dash-card { padding: 18px; }
      .gauge-container { width: 130px; height: 130px; }
      .gauge-score { font-size: 2.2rem; }
      .project-name { word-break: break-all; }
      .embed-code { font-size: 0.65rem; padding: 8px 10px; }
      .meta-pills { gap: 6px; }
      .meta-pill { font-size: 0.72rem; padding: 4px 10px; }
      .meta-card { padding: 16px 18px; }
      .install-cta { flex-direction: column; text-align: center; padding: 20px 18px; }
      .install-cta-btn { width: 100%; justify-content: center; }
    }
  </style>
</head>
<body>

  ${navbarHtml}

  <div class="container">

    <section class="hero">
      <div class="project-name">
        <a href="${githubUrl}" target="_blank" rel="noopener">${owner}/${repo}</a>
      </div>

      <div class="gauge-container">
        <svg viewBox="0 0 100 100">
          <circle class="gauge-bg" cx="50" cy="50" r="45" fill="none" stroke-width="8"/>
          <circle class="gauge-fill" cx="50" cy="50" r="45" fill="none" stroke-width="8" stroke-linecap="round"/>
        </svg>
        <div class="gauge-text">
          <div class="gauge-score">${result.score}</div>
          <div class="gauge-label">/ 100</div>
        </div>
      </div>

      <div>
        <span class="verdict-badge">${emoji} ${label}</span>
        ${trendHtml}
      </div>

      ${result.overrideReason ? `<div class="override-notice">⚠️ ${escapeHtml(result.overrideReason)}</div>` : ''}
      ${result.cached ? `<div class="cache-notice">Cached result · checked <time datetime="${escapeHtml(result.checkedAt)}" id="checkedTime">${escapeHtml(result.checkedAt.split('T')[0])}</time></div>` : ''}
    </section>

    ${renderMetadataCard(result.metadata, owner, repo, firstIndexed)}

    <!-- ─── Dashboard Grid (2-column) ──── -->
    <div class="dashboard-grid">

      <!-- Left column: History + Dep Summary -->
      <div style="display: flex; flex-direction: column; gap: 16px;">

        <!-- Score History Chart — hydrated client-side -->
        <div id="historyContainer" data-owner="${rawOwner}" data-repo="${rawRepo}" class="dash-card" style="padding: 0; border: none;"></div>

        <!-- Dependency Summary — hydrated by deps.js -->
        <div id="depSummaryContainer" class="dash-card" style="display: none;">
          <h2>Dependencies</h2>
          <div class="dep-summary-grid" id="depSummaryGrid"></div>
        </div>
      </div>

      <!-- Right column: Signals -->
      <div style="display: flex; flex-direction: column; gap: 16px;">
        ${result.signals.length > 0 ? `
        <div class="dash-card">
          <h2>Signals</h2>
          <div class="signals-grid">
            ${signalsHtml}
          </div>
        </div>
        ` : ''}
      </div>
    </div>

    <!-- Full-width CTA -->
    <div class="install-cta">
      <div class="install-cta-text">
        <h2>🚀 Automate this in CI</h2>
        <p>Add dependency health checks to every pull request. Zero config for public repos.</p>
        <div class="install-cta-sub">Free for public repos · No API key needed · Powered by OIDC</div>
      </div>
      <a href="${escapeHtml(ctaUrl)}" class="install-cta-btn" target="_blank" rel="noopener">
        Install Action →
      </a>
    </div>

    <!-- Embed / Use It — collapsible -->
    <div class="deps-section-card" style="margin-bottom: 20px;">
      <button class="deps-group-toggle" id="embedToggle" data-target="embedContent" aria-expanded="false">
        <span class="arrow">▶</span>
        📎 Embed & API
      </button>
      <div class="deps-group-content" id="embedContent">
        <div style="padding-top: 12px;">
          <div class="embed-row">
            <div class="embed-label">Badge (Markdown)</div>
            <div class="embed-code" onclick="copyText(this)" data-text="![Is It Alive?](${badgeUrl})">
              ![Is It Alive?](${badgeUrl})
              <span class="copy-hint">click to copy</span>
            </div>
          </div>
          <div class="embed-row">
            <div class="embed-label">API Endpoint</div>
            <div class="embed-code" onclick="copyText(this)" data-text="${apiUrl}">
              GET ${apiUrl}
              <span class="copy-hint">click to copy</span>
            </div>
          </div>
          <div class="embed-row">
            <div class="embed-label">cURL</div>
            <div class="embed-code" onclick="copyText(this)" data-text="curl -s ${apiUrl} | jq">
              curl -s ${apiUrl} | jq
              <span class="copy-hint">click to copy</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Dependency Health Drilldown — hydrated client-side -->
    <div id="depsContainer" data-owner="${rawOwner}" data-repo="${rawRepo}">
      <div class="deps-shimmer" id="depsShimmer">
        📦 Discovering dependencies…
      </div>
    </div>

  </div>

  ${footerHtml}

  <script>
    function copyText(el) {
      const text = el.getAttribute('data-text');
      navigator.clipboard.writeText(text).then(() => {
        const hint = el.querySelector('.copy-hint');
        if (hint) {
          hint.textContent = 'copied!';
          hint.style.opacity = '1';
          hint.style.color = '#22c55e';
          setTimeout(() => {
            hint.textContent = 'click to copy';
            hint.style.color = '';
            hint.style.opacity = '';
          }, 1500);
        }
      });
    }
    // Collapsible embed section
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
    // Localize the checked-at time to user's timezone
    const timeEl = document.getElementById('checkedTime');
    if (timeEl) {
      const d = new Date(timeEl.getAttribute('datetime'));
      timeEl.textContent = d.toLocaleString(undefined, {
        year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit',
      });
    }
  </script>
  <script>
    // Track real page views via sendBeacon — only fires in real browsers
    try {
      navigator.sendBeacon('/_view', JSON.stringify({
        r: '${rawOwner}/${rawRepo}',
        s: ${result.score},
        v: '${result.verdict}',
      }));
    } catch(e) {}
  </script>
  <script src="/js/history.js" defer></script>
  <script src="/js/deps.js" defer></script>
  ${themeScript}
  ${analyticsScript(analyticsToken)}
</body>
</html>`;
}
