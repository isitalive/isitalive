// ---------------------------------------------------------------------------
// Result page HTML — thin shell + client-side rendering from API
//
// Server renders <head> with OG tags (for social sharing / SEO).
// Client JS fetches /api/check/github/:owner/:repo and renders the UI.
// Analytics are tracked by the API call — no separate beacon needed.
// ---------------------------------------------------------------------------

import { navbarHtml, footerHtml, componentCss } from './components'
import { escapeHtml } from './error'
import { ogTags } from './og'

/**
 * Render a result page shell. OG tags are populated from optional cached data.
 * If no cached data is available, generic OG tags are used.
 */
export function resultPage(
  owner: string,
  repo: string,
  analyticsToken?: string,
  ogData?: { score: number; verdict: string } | null,
): string {
  const safeOwner = escapeHtml(owner)
  const safeRepo = escapeHtml(repo)
  const encodedOwner = encodeURIComponent(owner)
  const encodedRepo = encodeURIComponent(repo)

  const badgeUrl = `https://isitalive.dev/api/badge/github/${encodedOwner}/${encodedRepo}`
  const pageUrl = `https://isitalive.dev/github/${encodedOwner}/${encodedRepo}`

  // OG tags: use cached score/verdict if available, otherwise generic
  const ogTitle = `${owner}/${repo} — Is It Alive?`
  const ogDescription = ogData
    ? `${owner}/${repo} health score: ${ogData.score}/100 (${ogData.verdict}). Checked by Is It Alive?`
    : `Check the health of ${owner}/${repo} — Is It Alive?`

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
  <title>${safeOwner}/${safeRepo} — Is It Alive?</title>
  <meta name="description" content="${escapeHtml(ogDescription)}">
  ${ogTags({ title: ogTitle, description: ogDescription, url: pageUrl, image: badgeUrl })}
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="preload" as="style" href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap">
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" media="print" onload="this.media='all'">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    ${componentCss}

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
      pointer-events: none;
      z-index: 0;
    }
    .bg-orb-1 { width: 500px; height: 500px; background: radial-gradient(circle, rgba(99,102,241,0.15) 0%, transparent 70%); top: -150px; right: -100px; }
    .bg-orb-2 { width: 400px; height: 400px; background: radial-gradient(circle, rgba(99,102,241,0.12) 0%, transparent 70%); bottom: -150px; left: -100px; }

    .container {
      position: relative;
      z-index: 1;
      max-width: 900px;
      margin: 0 auto;
      padding: 0 24px;
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

    .gauge-container svg {
      display: block;
      width: 100%;
      height: 100%;
    }

    .gauge-bg { stroke: rgba(255,255,255,0.06); }
    .gauge-fill {
      stroke: var(--text-muted);
      stroke-dasharray: 283;
      stroke-dashoffset: 283;
      transition: stroke-dashoffset 1.2s ease-out, stroke 0.5s ease;
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
      font-size: 2.8rem;
      font-weight: 800;
      letter-spacing: -0.03em;
      color: var(--text-muted);
      line-height: 1;
      transition: color 0.5s ease;
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
      background: rgba(255,255,255,0.04);
      border: 1px solid rgba(255,255,255,0.1);
      color: var(--text-muted);
      padding: 8px 20px;
      border-radius: 99px;
      font-size: 0.9rem;
      font-weight: 600;
      transition: all 0.5s ease;
    }

    .override-notice {
      margin-top: 16px;
      background: rgba(239,68,68,0.08);
      border: 1px solid rgba(239,68,68,0.2);
      color: #fca5a5;
      padding: 12px 20px;
      border-radius: 12px;
      font-size: 0.82rem;
    }

    .cache-notice {
      margin-top: 10px;
      font-size: 0.72rem;
      color: var(--text-muted);
    }

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

    .embed-row { margin-bottom: 16px; }
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

    /* ── Metadata Card ──────────────────── */
    .meta-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 24px 28px;
      margin-bottom: 28px;
    }

    .meta-description {
      font-size: 0.9rem;
      color: var(--text-secondary);
      line-height: 1.5;
      margin-bottom: 16px;
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
      background: rgba(255,255,255,0.04);
      border: 1px solid var(--border);
      border-radius: 99px;
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
      border-radius: 99px;
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

    /* ── Loading skeleton ──────────────── */
    .skeleton {
      animation: shimmer 1.5s infinite;
      background: linear-gradient(90deg, rgba(255,255,255,0.04) 25%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.04) 75%);
      background-size: 200% 100%;
      border-radius: 8px;
    }

    @keyframes shimmer {
      0% { background-position: 200% 0; }
      100% { background-position: -200% 0; }
    }

    .skeleton-signal {
      height: 70px;
      margin-bottom: 16px;
      border-radius: 8px;
    }

    /* ── Error state ────────────────────── */
    .error-state {
      text-align: center;
      padding: 60px 20px;
    }
    .error-state .error-icon { font-size: 3rem; margin-bottom: 16px; }
    .error-state .error-message {
      font-size: 1.1rem;
      color: var(--text-secondary);
      margin-bottom: 24px;
    }
    .error-state .retry-btn {
      background: var(--accent);
      color: #fff;
      border: none;
      border-radius: 10px;
      padding: 12px 28px;
      font-family: 'Inter', sans-serif;
      font-size: 0.9rem;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.2s;
    }
    .error-state .retry-btn:hover { background: #5558e6; }

    @media (max-width: 640px) {
      .hero { padding: 24px 0 36px; }
      .signals, .embed-section, .meta-card { padding: 20px; }
      .gauge-container { width: 140px; height: 140px; }
      .gauge-score { font-size: 2.2rem; }
      .project-name { word-break: break-all; }
      .embed-code { font-size: 0.65rem; padding: 10px 12px; }
      .meta-pills { gap: 6px; }
      .meta-pill { font-size: 0.72rem; padding: 4px 10px; }
    }
  </style>
</head>
<body>
  <div class="bg-orb bg-orb-1"></div>
  <div class="bg-orb bg-orb-2"></div>

  ${navbarHtml}

  <div class="container">

    <section class="hero">
      <div class="project-name">
        <a href="https://github.com/${safeOwner}/${safeRepo}" target="_blank" rel="noopener">${safeOwner}/${safeRepo}</a>
      </div>

      <div class="gauge-container">
        <svg viewBox="0 0 100 100">
          <circle class="gauge-bg" cx="50" cy="50" r="45" fill="none" stroke-width="8"/>
          <circle class="gauge-fill" id="gaugeFill" cx="50" cy="50" r="45" fill="none" stroke-width="8" stroke-linecap="round"/>
        </svg>
        <div class="gauge-text">
          <div class="gauge-score" id="gaugeScore">—</div>
          <div class="gauge-label">/ 100</div>
        </div>
      </div>

      <div id="verdictArea">
        <span class="verdict-badge" id="verdictBadge">Loading…</span>
      </div>
      <div id="overrideArea"></div>
      <div id="cacheArea"></div>
    </section>

    <div id="metaArea">
      <!-- Skeleton for metadata -->
      <section class="meta-card">
        <div class="skeleton" style="height: 20px; width: 80%; margin-bottom: 16px;"></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <div class="skeleton" style="height: 28px; width: 70px;"></div>
          <div class="skeleton" style="height: 28px; width: 90px;"></div>
          <div class="skeleton" style="height: 28px; width: 60px;"></div>
        </div>
      </section>
    </div>

    <div id="signalsArea">
      <!-- Skeleton for signals -->
      <section class="signals">
        <h2>Signal Breakdown</h2>
        <div class="skeleton skeleton-signal"></div>
        <div class="skeleton skeleton-signal"></div>
        <div class="skeleton skeleton-signal"></div>
        <div class="skeleton skeleton-signal"></div>
      </section>
    </div>

    <div id="embedArea" style="display:none">
      <section class="embed-section">
        <h2>Use It</h2>
        <div class="embed-row">
          <div class="embed-label">Badge (Markdown)</div>
          <div class="embed-code" onclick="copyText(this)" id="embedBadge">
            <span class="copy-hint">click to copy</span>
          </div>
        </div>
        <div class="embed-row">
          <div class="embed-label">API Endpoint</div>
          <div class="embed-code" onclick="copyText(this)" id="embedApi">
            <span class="copy-hint">click to copy</span>
          </div>
        </div>
        <div class="embed-row">
          <div class="embed-label">cURL</div>
          <div class="embed-code" onclick="copyText(this)" id="embedCurl">
            <span class="copy-hint">click to copy</span>
          </div>
        </div>
      </section>
    </div>

  </div>

  ${footerHtml}

  <script>
    // ── Config (injected by server) ─────────────────────────────────────
    var OWNER = '${owner.replace(/'/g, "\\'")}';
    var REPO = '${repo.replace(/'/g, "\\'")}';
    var API_URL = '/api/check/github/' + encodeURIComponent(OWNER) + '/' + encodeURIComponent(REPO);

    // ── Color helpers ───────────────────────────────────────────────────
    var VERDICT_COLORS = { healthy:'#22c55e', stable:'#eab308', degraded:'#f97316', critical:'#ef4444', unmaintained:'#6b7280' };
    var VERDICT_EMOJI = { healthy:'🟢', stable:'🟡', degraded:'🟠', critical:'🔴', unmaintained:'⚫' };
    var VERDICT_LABELS = { healthy:'Healthy', stable:'Stable', degraded:'Degraded', critical:'Critical', unmaintained:'Unmaintained' };
    var VERDICT_NORMALIZE = { declining:'degraded', inactive:'degraded', stale:'degraded', at_risk:'critical', dormant:'critical', abandoned:'unmaintained', maintained:'stable' };

    function scoreColor(s) {
      if (s >= 80) return '#22c55e';
      if (s >= 60) return '#eab308';
      if (s >= 40) return '#f97316';
      if (s >= 20) return '#ef4444';
      return '#6b7280';
    }

    function esc(s) {
      var d = document.createElement('div');
      d.textContent = s;
      return d.innerHTML;
    }

    function fmtNum(n) {
      return n >= 1000 ? (n / 1000).toFixed(1).replace(/\\.0$/, '') + 'k' : String(n);
    }

    // ── Fetch + Render ──────────────────────────────────────────────────
    fetch(API_URL)
      .then(function(r) {
        if (!r.ok) throw new Error(r.status === 404 ? 'Project not found' : 'Failed to fetch');
        return r.json();
      })
      .then(function(data) {
        var verdict = VERDICT_NORMALIZE[data.verdict] || data.verdict;
        var color = VERDICT_COLORS[verdict] || '#6b7280';
        var emoji = VERDICT_EMOJI[verdict] || '⚫';
        var label = VERDICT_LABELS[verdict] || verdict;

        // Update background orb color
        document.querySelector('.bg-orb-1').style.background =
          'radial-gradient(circle, ' + color + '22 0%, transparent 70%)';

        // Animate gauge
        var dashOffset = 283 - (283 * data.score) / 100;
        var fill = document.getElementById('gaugeFill');
        fill.style.stroke = color;
        fill.style.strokeDashoffset = dashOffset;

        var scoreEl = document.getElementById('gaugeScore');
        scoreEl.textContent = data.score;
        scoreEl.style.color = color;

        // Verdict badge
        var badge = document.getElementById('verdictBadge');
        badge.textContent = emoji + ' ' + label;
        badge.style.background = color + '18';
        badge.style.borderColor = color + '30';
        badge.style.color = color;

        // Override reason
        if (data.overrideReason) {
          document.getElementById('overrideArea').innerHTML =
            '<div class="override-notice">⚠️ ' + esc(data.overrideReason) + '</div>';
        }

        // Cache notice
        if (data.cached) {
          var d = new Date(data.checkedAt);
          var fmt = d.toLocaleString(undefined, { year:'numeric', month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' });
          document.getElementById('cacheArea').innerHTML =
            '<div class="cache-notice">Cached result · checked ' + fmt + '</div>';
        }

        // Metadata card
        var meta = data.metadata;
        if (meta) {
          var pills = [];
          var ghUrl = 'https://github.com/' + esc(OWNER) + '/' + esc(REPO);

          if (meta.language) {
            var dotColor = meta.languageColor || '#8b8b9e';
            pills.push('<span class="meta-pill"><span class="lang-dot" style="background:' + esc(dotColor) + '"></span>' + esc(meta.language) + '</span>');
          }
          if (meta.license && meta.license !== 'NOASSERTION') {
            pills.push('<span class="meta-pill">© ' + esc(meta.license) + '</span>');
          }
          if (meta.homepageUrl) {
            var display = meta.homepageUrl.replace(/^https?:\\/\\//, '').replace(/\\/$/, '');
            pills.push('<a class="meta-pill" href="' + esc(meta.homepageUrl) + '" target="_blank" rel="noopener">🌐 ' + esc(display) + '</a>');
          }
          pills.push('<a class="meta-pill" href="' + ghUrl + '" target="_blank" rel="noopener">GitHub</a>');
          pills.push('<span class="meta-pill">⭐ ' + fmtNum(meta.stars) + '</span>');
          pills.push('<span class="meta-pill">🍴 ' + fmtNum(meta.forks) + '</span>');

          document.getElementById('metaArea').innerHTML =
            '<section class="meta-card">' +
            (meta.description ? '<div class="meta-description">' + esc(meta.description) + '</div>' : '') +
            '<div class="meta-pills">' + pills.join('') + '</div>' +
            '</section>';
        } else {
          document.getElementById('metaArea').innerHTML = '';
        }

        // Signals
        if (data.signals && data.signals.length) {
          var html = '<section class="signals"><h2>Signal Breakdown</h2>';
          data.signals.forEach(function(s) {
            var sc = scoreColor(s.score);
            html += '<div class="signal-row">' +
              '<div class="signal-header">' +
              '<span class="signal-name">' + esc(s.label) + '</span>' +
              '<span class="signal-score" style="color:' + sc + '">' + s.score + '</span>' +
              '</div>' +
              '<div class="signal-meta">' +
              '<span class="signal-value">' + esc(String(s.value)) + '</span>' +
              '<span class="signal-weight">' + Math.round(s.weight * 100) + '% weight</span>' +
              '</div>' +
              '<div style="width:100%;height:6px;background:rgba(255,255,255,0.06);border-radius:3px;overflow:hidden">' +
              '<div style="width:' + s.score + '%;height:100%;background:' + sc + ';border-radius:3px;transition:width 0.8s ease"></div>' +
              '</div></div>';
          });
          html += '</section>';
          document.getElementById('signalsArea').innerHTML = html;
        } else {
          document.getElementById('signalsArea').innerHTML = '';
        }

        // Embed section
        var badgeUrl = 'https://isitalive.dev/api/badge/github/' + encodeURIComponent(OWNER) + '/' + encodeURIComponent(REPO);
        var apiUrl = 'https://isitalive.dev' + API_URL;
        var embedBadge = document.getElementById('embedBadge');
        var embedApi = document.getElementById('embedApi');
        var embedCurl = document.getElementById('embedCurl');

        var badgeText = '![Is It Alive?](' + badgeUrl + ')';
        embedBadge.setAttribute('data-text', badgeText);
        embedBadge.insertBefore(document.createTextNode(badgeText), embedBadge.firstChild);

        var apiText = apiUrl;
        embedApi.setAttribute('data-text', apiText);
        embedApi.insertBefore(document.createTextNode('GET ' + apiText), embedApi.firstChild);

        var curlText = 'curl -s ' + apiUrl + ' | jq';
        embedCurl.setAttribute('data-text', curlText);
        embedCurl.insertBefore(document.createTextNode(curlText), embedCurl.firstChild);

        document.getElementById('embedArea').style.display = '';
      })
      .catch(function(err) {
        var msg = err.message || 'Something went wrong';
        document.querySelector('.container').innerHTML =
          '<section class="error-state">' +
          '<div class="error-icon">💀</div>' +
          '<div class="error-message">' + esc(msg) + '</div>' +
          '<button class="retry-btn" onclick="location.reload()">Try Again</button>' +
          '</section>';
      });

    // ── Copy helper ─────────────────────────────────────────────────────
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
  </script>
  ${analyticsToken ? `<script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token":"${analyticsToken}"}'></script>` : ''}
</body>
</html>`
}
