// ---------------------------------------------------------------------------
// Result page HTML — shows score gauge, verdict, signal breakdown
// ---------------------------------------------------------------------------

import type { ScoringResult, Verdict } from '../scoring/types';

const VERDICT_COLORS: Record<Verdict, string> = {
  healthy: '#22c55e',
  maintained: '#eab308',
  declining: '#f97316',
  at_risk: '#ef4444',
  abandoned: '#6b7280',
};

const VERDICT_EMOJI: Record<Verdict, string> = {
  healthy: '🟢',
  maintained: '🟡',
  declining: '🟠',
  at_risk: '🔴',
  abandoned: '⚫',
};

const VERDICT_LABELS: Record<Verdict, string> = {
  healthy: 'Healthy',
  maintained: 'Maintained',
  declining: 'Declining',
  at_risk: 'At Risk',
  abandoned: 'Abandoned',
};

function signalBar(score: number, color: string): string {
  return `<div style="
    width: 100%;
    height: 6px;
    background: rgba(255,255,255,0.06);
    border-radius: 3px;
    overflow: hidden;
  "><div style="
    width: ${score}%;
    height: 100%;
    background: ${color};
    border-radius: 3px;
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

export function resultPage(result: ScoringResult, owner: string, repo: string): string {
  const color = VERDICT_COLORS[result.verdict];
  const emoji = VERDICT_EMOJI[result.verdict];
  const label = VERDICT_LABELS[result.verdict];
  const dashOffset = 283 - (283 * result.score) / 100; // for SVG circle gauge

  const signalsHtml = result.signals.map(s => `
    <div class="signal-row">
      <div class="signal-header">
        <span class="signal-name">${s.label}</span>
        <span class="signal-score" style="color: ${scoreColor(s.score)}">${s.score}</span>
      </div>
      <div class="signal-meta">
        <span class="signal-value">${s.value}</span>
        <span class="signal-weight">${Math.round(s.weight * 100)}% weight</span>
      </div>
      ${signalBar(s.score, scoreColor(s.score))}
    </div>
  `).join('');

  const badgeUrl = `/api/badge/github/${owner}/${repo}`;
  const apiUrl = `/api/check/github/${owner}/${repo}`;
  const githubUrl = `https://github.com/${owner}/${repo}`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${owner}/${repo} — Is It Alive?</title>
  <meta name="description" content="${owner}/${repo} health score: ${result.score}/100 (${label}). Checked by Is It Alive?">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --bg-primary: #0a0a0f;
      --surface: rgba(255,255,255,0.04);
      --surface-hover: rgba(255,255,255,0.08);
      --border: rgba(255,255,255,0.08);
      --text-primary: #e8e8ed;
      --text-secondary: #8b8b9e;
      --text-muted: #55556a;
      --accent: #6366f1;
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
      filter: blur(120px);
      opacity: 0.12;
      pointer-events: none;
      z-index: 0;
    }
    .bg-orb-1 { width: 500px; height: 500px; background: ${color}; top: -150px; right: -100px; }
    .bg-orb-2 { width: 400px; height: 400px; background: var(--accent); bottom: -150px; left: -100px; }

    .container {
      position: relative;
      z-index: 1;
      max-width: 680px;
      margin: 0 auto;
      padding: 0 24px;
    }

    /* ── Nav ──────────────────────────────── */
    nav {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 24px 0;
    }

    nav a {
      color: var(--text-secondary);
      text-decoration: none;
      font-size: 0.85rem;
      font-weight: 500;
      transition: color 0.2s;
    }

    nav a:hover { color: var(--text-primary); }

    .nav-logo {
      font-size: 0.8rem;
      font-weight: 700;
      letter-spacing: 2px;
      text-transform: uppercase;
      color: var(--accent);
    }

    /* ── Score Hero ───────────────────────── */
    .hero {
      text-align: center;
      padding: 40px 0 48px;
    }

    .project-name {
      font-size: 0.9rem;
      color: var(--text-secondary);
      margin-bottom: 6px;
    }

    .project-name a {
      color: var(--text-secondary);
      text-decoration: none;
      border-bottom: 1px dashed rgba(255,255,255,0.15);
      transition: color 0.2s;
    }

    .project-name a:hover { color: var(--accent); }

    .gauge-container {
      position: relative;
      display: inline-block;
      width: 180px;
      height: 180px;
      margin: 24px 0 20px;
    }

    .gauge-bg { stroke: rgba(255,255,255,0.06); }
    .gauge-fill {
      stroke: ${color};
      stroke-dasharray: 283;
      stroke-dashoffset: ${dashOffset};
      transition: stroke-dashoffset 1.2s ease-out;
      transform: rotate(-90deg);
      transform-origin: center;
      filter: drop-shadow(0 0 8px ${color}40);
    }

    .gauge-text {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      text-align: center;
    }

    .gauge-score {
      font-size: 2.8rem;
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
      border-radius: 99px;
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
      border-radius: 12px;
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

    /* ── Signals ─────────────────────────── */
    .signals {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 28px;
      margin-bottom: 28px;
    }

    .signals h2 {
      font-size: 1rem;
      font-weight: 600;
      margin-bottom: 20px;
      color: var(--text-secondary);
    }

    .signal-row {
      margin-bottom: 20px;
    }

    .signal-row:last-child { margin-bottom: 0; }

    .signal-header {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      margin-bottom: 4px;
    }

    .signal-name {
      font-size: 0.85rem;
      font-weight: 500;
    }

    .signal-score {
      font-size: 0.85rem;
      font-weight: 700;
    }

    .signal-meta {
      display: flex;
      justify-content: space-between;
      font-size: 0.72rem;
      color: var(--text-muted);
      margin-bottom: 8px;
    }

    /* ── Embed / API ─────────────────────── */
    .embed-section {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 28px;
      margin-bottom: 28px;
    }

    .embed-section h2 {
      font-size: 1rem;
      font-weight: 600;
      margin-bottom: 16px;
      color: var(--text-secondary);
    }

    .embed-row {
      margin-bottom: 16px;
    }

    .embed-row:last-child { margin-bottom: 0; }

    .embed-label {
      font-size: 0.75rem;
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
      font-size: 0.78rem;
      color: var(--text-secondary);
      word-break: break-all;
      cursor: pointer;
      transition: border-color 0.2s;
      position: relative;
    }

    .embed-code:hover {
      border-color: var(--accent);
    }

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

    /* ── Footer ─────────────────────────── */
    footer {
      text-align: center;
      padding: 40px 0;
      color: var(--text-muted);
      font-size: 0.75rem;
    }

    @media (max-width: 640px) {
      .hero { padding: 24px 0 36px; }
      .signals, .embed-section { padding: 20px; }
    }
  </style>
</head>
<body>
  <div class="bg-orb bg-orb-1"></div>
  <div class="bg-orb bg-orb-2"></div>

  <div class="container">
    <nav>
      <a href="/" class="nav-logo">Is It Alive</a>
      <a href="/">← Check another</a>
    </nav>

    <section class="hero">
      <div class="project-name">
        <a href="${githubUrl}" target="_blank" rel="noopener">${owner}/${repo}</a>
      </div>

      <div class="gauge-container">
        <svg viewBox="0 0 100 100" width="180" height="180">
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
      </div>

      ${result.overrideReason ? `<div class="override-notice">⚠️ ${result.overrideReason}</div>` : ''}
      ${result.cached ? `<div class="cache-notice">Cached result · checked ${result.checkedAt.split('T')[0]}</div>` : ''}
    </section>

    ${result.signals.length > 0 ? `
    <section class="signals">
      <h2>Signal Breakdown</h2>
      ${signalsHtml}
    </section>
    ` : ''}

    <section class="embed-section">
      <h2>Use It</h2>

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
    </section>

    <footer>
      <p>Checked at ${result.checkedAt.split('T')[0]} · Powered by Cloudflare Workers</p>
    </footer>
  </div>

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
  </script>
</body>
</html>`;
}
