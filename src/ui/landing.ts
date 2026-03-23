// ---------------------------------------------------------------------------
// Landing page HTML — dark, modern, glassmorphism design
// ---------------------------------------------------------------------------

import { navbarHtml, footerHtml, componentCss } from './components';
import { ogTags } from './og';

export function landingPage(siteKey?: string, analyticsToken?: string): string {
  const hasTurnstile = !!siteKey;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
  <title>Is It Alive? — Open Source Health Checker</title>
  <meta name="description" content="Instantly check if an open-source project is actively maintained or abandoned. Fast, cached, API-ready.">
  ${ogTags({
    title: 'Is It Alive? — Open Source Health Checker',
    description: 'Instantly check if an open-source project is actively maintained or abandoned. Fast, cached, API-ready.',
    url: 'https://isitalive.dev/',
  })}
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="preload" as="style" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap">
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap" media="print" onload="this.media='all'">
  <noscript><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap"></noscript>
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

    /* Background gradient orbs — use radial-gradient instead of blur() for iOS perf */
    .bg-orb {
      position: fixed;
      border-radius: 50%;
      pointer-events: none;
      z-index: 0;
    }
    .bg-orb-1 { width: 600px; height: 600px; background: radial-gradient(circle, rgba(99,102,241,0.15) 0%, transparent 70%); top: -200px; left: -150px; }
    .bg-orb-2 { width: 500px; height: 500px; background: radial-gradient(circle, rgba(139,92,246,0.15) 0%, transparent 70%); bottom: -200px; right: -100px; }
    .bg-orb-3 { width: 300px; height: 300px; background: radial-gradient(circle, rgba(34,197,94,0.08) 0%, transparent 70%); top: 40%; right: 10%; }

    .container {
      position: relative;
      z-index: 1;
      max-width: 1000px;
      margin: 0 auto;
      padding: 0 24px;
    }

    /* ── Header ─────────────────────────────── */
    header {
      text-align: center;
      padding: 120px 0 60px;
    }

    .logo {
      font-size: 14px;
      font-weight: 600;
      letter-spacing: 3px;
      text-transform: uppercase;
      color: var(--accent);
      margin-bottom: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
    }

    .logo .pulse {
      display: inline-block;
      width: 8px; height: 8px;
      background: var(--green);
      border-radius: 50%;
      animation: pulse 2s ease-in-out infinite;
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; box-shadow: 0 0 0 0 rgba(34,197,94,0.4); }
      50% { opacity: 0.8; box-shadow: 0 0 0 8px rgba(34,197,94,0); }
    }

    h1 {
      font-size: clamp(2.5rem, 6vw, 4rem);
      font-weight: 800;
      line-height: 1.1;
      letter-spacing: -0.03em;
      margin-bottom: 20px;
      background: linear-gradient(135deg, #fff 0%, #a5a5c0 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }

    .subtitle {
      font-size: 1.15rem;
      color: var(--text-secondary);
      line-height: 1.6;
      max-width: 500px;
      margin: 0 auto;
      font-weight: 300;
    }

    /* ── Search ─────────────────────────────── */
    .search-container {
      margin-top: 48px;
      display: flex;
      flex-direction: column;
      align-items: center;
      width: 100%;
    }

    .search-box {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 20px;
      padding: 8px;
      width: 100%;
      display: flex;
      align-items: center;
      gap: 0;
      transition: border-color 0.3s, box-shadow 0.3s;
    }

    .search-box:focus-within {
      border-color: var(--accent);
      box-shadow: 0 0 0 4px var(--accent-glow);
    }

    #searchForm {
      width: 100%;
      max-width: 1200px;
    }



    .cf-turnstile {
      display: flex;
      justify-content: center;
      margin-top: 16px;
    }

    .search-box input {
      flex: 1;
      background: none;
      border: none;
      outline: none;
      color: var(--text-primary);
      font-family: 'Inter', sans-serif;
      font-size: 1.2rem;
      padding: 20px 28px;
      caret-color: var(--accent);
    }

    .search-box input::placeholder {
      color: var(--text-muted);
    }

    .search-box button {
      background: var(--accent);
      color: #fff;
      border: none;
      border-radius: 14px;
      padding: 18px 36px;
      font-family: 'Inter', sans-serif;
      font-size: 1rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
      white-space: nowrap;
    }

    .search-box button:hover { background: #5558e6; }
    .search-box button:active { transform: scale(0.97); }

    .search-hint {
      text-align: center;
      margin-top: 12px;
      font-size: 0.8rem;
      color: var(--text-muted);
    }

    .search-hint code {
      background: var(--surface);
      padding: 2px 8px;
      border-radius: 6px;
      font-size: 0.78rem;
      color: var(--text-secondary);
    }

    /* ── Recent queries ──────────────────────── */
    .recent-section {
      margin-top: 32px;
      text-align: center;
    }

    .recent-label {
      font-size: 0.7rem;
      text-transform: uppercase;
      letter-spacing: 1.5px;
      color: var(--text-muted);
      margin-bottom: 12px;
    }

    .recent-list {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: 8px;
    }

    .recent-chip {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 99px;
      padding: 6px 14px;
      text-decoration: none;
      color: var(--text-secondary);
      font-size: 0.78rem;
      transition: border-color 0.2s, color 0.2s;
    }

    .recent-chip:hover {
      border-color: rgba(255,255,255,0.2);
      color: var(--text-primary);
    }

    .recent-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      flex-shrink: 0;
    }

    /* ── Two-column Section ─────────────────── */
    .two-col-section {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 32px;
      margin-top: 60px;
      align-items: start;
    }

    .two-col-section h2 {
      font-size: 1.2rem;
      font-weight: 700;
      margin-bottom: 20px;
      letter-spacing: -0.02em;
    }

    .col-right .api-subtitle {
      color: var(--text-secondary);
      font-size: 0.82rem;
      margin-bottom: 16px;
    }

    .signals-grid {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .signal-item {
      display: flex;
      align-items: center;
      gap: 12px;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 12px 14px;
      font-size: 0.82rem;
    }

    .signal-weight {
      background: var(--accent);
      color: #fff;
      font-size: 0.7rem;
      font-weight: 700;
      padding: 4px 8px;
      border-radius: 6px;
      white-space: nowrap;
    }

    /* ── Code Block ─────────────────────────── */
    .code-block {
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 20px;
      overflow-x: auto;
      font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
      font-size: 0.75rem;
      line-height: 1.7;
      color: var(--text-secondary);
    }

    .code-block .comment { color: var(--text-muted); }
    .code-block .url { color: var(--accent); }
    .code-block .key { color: #c084fc; }
    .code-block .string { color: var(--green); }
    .code-block .number { color: var(--yellow); }

    /* ── Responsive ─────────────────────────── */
    @media (max-width: 768px) {
      .two-col-section { grid-template-columns: 1fr; gap: 40px; }
    }

    @media (max-width: 640px) {
      .container { padding: 0 20px; }
      header { padding: 60px 0 40px; }
      h1 { font-size: 1.8rem; }
      .subtitle { font-size: 0.9rem; }

      .search-box {
        flex-direction: column;
        padding: 8px;
        border-radius: 16px;
      }
      .search-box input {
        width: 100%;
        padding: 14px 16px;
        font-size: 1rem;
      }
      .search-box button {
        width: 100%;
        border-radius: 12px;
        padding: 14px 24px;
        font-size: 0.9rem;
      }

      .badge-cta h2 { font-size: 1.3rem; }
      .badge-snippets { max-width: 100%; }
      .snippet-block { flex-direction: column; align-items: stretch; gap: 8px; }
      .snippet-label { min-width: unset; text-align: center; }
      .snippet-code { font-size: 0.65rem; min-width: 0; }
      .copy-btn { align-self: center; }
    }

    /* ── Loading transition ──────────────────── */
    .loading-bar {
      position: fixed;
      top: 0;
      left: 0;
      height: 3px;
      background: linear-gradient(90deg, var(--accent), #a78bfa, var(--accent));
      background-size: 200% 100%;
      width: 0;
      z-index: 9999;
      transition: width 0.4s ease;
      animation: shimmer 1.5s ease-in-out infinite;
    }

    @keyframes shimmer {
      0% { background-position: -200% 0; }
      100% { background-position: 200% 0; }
    }

    .loading-bar.active {
      width: 85%;
      transition: width 8s cubic-bezier(0.1, 0.05, 0, 1);
    }

    .loading-bar.done {
      width: 100%;
      transition: width 0.2s ease;
    }

    .search-box.loading {
      animation: boxPulse 2s ease-in-out infinite;
    }

    @keyframes boxPulse {
      0%, 100% { box-shadow: 0 0 0 0 var(--accent-glow); }
      50% { box-shadow: 0 0 0 8px transparent; }
    }

    .search-box button .btn-text { display: inline; }
    .search-box button .btn-spinner { display: none; }

    .search-box button.loading .btn-text { display: none; }
    .search-box button.loading .btn-spinner {
      display: inline-block;
      width: 20px;
      height: 20px;
      border: 2px solid rgba(255,255,255,0.3);
      border-top-color: #fff;
      border-radius: 50%;
      animation: spin 0.6s linear infinite;
    }

    .search-box button.loading {
      pointer-events: none;
      opacity: 0.8;
      min-width: 140px;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    body.navigating {
      opacity: 0.6;
      transition: opacity 0.3s ease;
    }

    /* ── Badge CTA ───────────────────────── */
    .badge-cta {
      text-align: center;
      padding: 60px 0 40px;
    }
    .badge-cta h2 {
      font-size: 1.6rem;
      font-weight: 700;
      margin-bottom: 8px;
    }
    .badge-subtitle {
      color: var(--text-secondary);
      font-size: 0.9rem;
      margin-bottom: 32px;
    }
    .badge-preview {
      margin-bottom: 28px;
    }
    .badge-img {
      height: 20px;
      border-radius: 3px;
    }
    .badge-snippets {
      display: flex;
      flex-direction: column;
      gap: 12px;
      max-width: 700px;
      margin: 0 auto;
    }
    .snippet-block {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 12px 16px;
      display: flex;
      align-items: center;
      gap: 12px;
      min-width: 0;
      overflow: hidden;
    }
    .snippet-label {
      font-size: 0.72rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--text-muted);
      min-width: 70px;
      text-align: left;
    }
    .snippet-code {
      flex: 1;
      font-family: 'SF Mono', Menlo, monospace;
      font-size: 0.72rem;
      color: var(--text-secondary);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      text-align: left;
    }
    .copy-btn {
      background: var(--accent);
      color: white;
      border: none;
      border-radius: 6px;
      padding: 5px 14px;
      font-size: 0.72rem;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.2s, transform 0.1s;
      flex-shrink: 0;
    }
    .copy-btn:hover { background: #4f46e5; }
    .copy-btn:active { transform: scale(0.96); }
    .copy-btn.copied {
      background: var(--green);
    }
  </style>
</head>
<body>
  <div class="bg-orb bg-orb-1"></div>
  <div class="bg-orb bg-orb-2"></div>
  <div class="bg-orb bg-orb-3"></div>

  ${navbarHtml}

  <div class="container">    <header>

      <h1>Is this project safe to depend on?</h1>
      <p class="subtitle">Instantly check the health of any open-source project. One query, one score, one answer.</p>

      <div class="search-container">
        <form action="/_check" method="POST" id="searchForm">
          <div class="search-box" id="searchBox">
            <input
              type="text"
              name="repo"
              id="searchInput"
              placeholder="owner/repo or link to package.json / go.mod"
              required
              autofocus
            />
            <button type="submit" id="searchBtn">
              <span class="btn-text">Check Health</span>
              <span class="btn-spinner"></span>
            </button>
          </div>
          ${hasTurnstile ? `<div class="cf-turnstile" data-sitekey="${siteKey}" data-theme="dark" data-size="normal"></div>` : ''}
        </form>
        <p class="search-hint">Try <code>vercel/next.js</code> or paste a link to a <code>package.json</code> or <code>go.mod</code></p>
      </div>
    </header>

    <div class="recent-section" id="recentSection" style="display:none">
      <div class="recent-label">Recently checked</div>
      <div class="recent-list" id="recentList"></div>
    </div>

    <section class="badge-cta">
      <h2>Show the world your project is alive</h2>
      <p class="badge-subtitle">Add a live health badge to your README in seconds.</p>

      <div class="badge-preview">
        <img src="/api/badge/github/vercel/next.js" alt="Is It Alive? badge" class="badge-img" />
      </div>

      <div class="badge-snippets">
        <div class="snippet-block">
          <div class="snippet-label">Markdown</div>
          <div class="snippet-code" id="badgeMd">[![Is It Alive?](https://isitalive.dev/api/badge/github/YOUR_ORG/YOUR_REPO)](https://isitalive.dev/github/YOUR_ORG/YOUR_REPO)</div>
          <button class="copy-btn" onclick="copySnippet('badgeMd')">Copy</button>
        </div>
        <div class="snippet-block">
          <div class="snippet-label">HTML</div>
          <div class="snippet-code" id="badgeHtml">&lt;a href="https://isitalive.dev/github/YOUR_ORG/YOUR_REPO"&gt;&lt;img src="https://isitalive.dev/api/badge/github/YOUR_ORG/YOUR_REPO" alt="Is It Alive?"&gt;&lt;/a&gt;</div>
          <button class="copy-btn" onclick="copySnippet('badgeHtml')">Copy</button>
        </div>
      </div>
    </section>

    <section class="two-col-section">
      <div class="col-left">
        <h2>What we check</h2>
        <div class="signals-grid">
          <div class="signal-item"><span class="signal-weight">25%</span> Last commit activity</div>
          <div class="signal-item"><span class="signal-weight">15%</span> Release cadence</div>
          <div class="signal-item"><span class="signal-weight">15%</span> PR responsiveness</div>
          <div class="signal-item"><span class="signal-weight">10%</span> Issue staleness</div>
          <div class="signal-item"><span class="signal-weight">10%</span> Contributor diversity</div>
          <div class="signal-item"><span class="signal-weight">10%</span> Bus factor risk</div>
          <div class="signal-item"><span class="signal-weight">10%</span> CI/CD presence</div>
          <div class="signal-item"><span class="signal-weight">5%</span> Community size</div>
        </div>
      </div>
      <div class="col-right">
        <h2>Built for machines, too</h2>
        <p class="api-subtitle">One endpoint. One answer. Perfect for AI agents.</p>
        <div class="code-block">
          <span class="comment">// Check any GitHub project</span><br>
          <span class="url">GET https://isitalive.dev/api/check/github/vercel/next.js</span><br><br>
          <span class="comment">// Response</span><br>
          {<br>
          &nbsp;&nbsp;<span class="key">"score"</span>: <span class="number">92</span>,<br>
          &nbsp;&nbsp;<span class="key">"verdict"</span>: <span class="string">"healthy"</span>,<br>
          &nbsp;&nbsp;<span class="key">"project"</span>: <span class="string">"github/vercel/next.js"</span>,<br>
          &nbsp;&nbsp;<span class="key">"signals"</span>: [ ... ]<br>
          }
        </div>
      </div>
    </section>

  </div>

  ${footerHtml}

  <div class="loading-bar" id="loadingBar"></div>

  ${hasTurnstile ? '<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>' : ''}
  <script>
    document.getElementById('searchForm').addEventListener('submit', function(e) {
      const input = document.getElementById('searchInput').value.trim();
      if (!input) { e.preventDefault(); return; }

      // Show loading state
      var btn = document.getElementById('searchBtn');
      var box = document.getElementById('searchBox');
      var bar = document.getElementById('loadingBar');
      btn.classList.add('loading');
      box.classList.add('loading');
      bar.classList.add('active');
      document.getElementById('searchInput').readOnly = true;

      ${hasTurnstile ? `// Let the form POST with Turnstile token — server handles redirect and manifest detection` : `
      // No Turnstile (local dev) — do client-side redirect
      e.preventDefault();

      // Detect manifest URL: github.com/.../package.json or go.mod (only these filenames)
      var manifestRx = /(?:https?:\/\/)?(?:www\.)?github\.com\/.+\/blob\/.+\/(package\.json|go\.mod)$/i;
      if (manifestRx.test(input)) {
        // Submit as audit — POST to /_audit with url field
        var form = document.createElement('form');
        form.method = 'POST';
        form.action = '/_audit';
        var urlInput = document.createElement('input');
        urlInput.type = 'hidden';
        urlInput.name = 'url';
        urlInput.value = input;
        form.appendChild(urlInput);
        document.body.appendChild(form);
        document.body.classList.add('navigating');
        form.submit();
        return;
      }

      let path = input
        .replace(/^https?:\\/\\//, '')
        .replace(/^(www\\.)?github\\.com\\//, '')
        .replace(/\\.git$/, '').replace(/\\/+$/, '');

      const parts = path.split('/');
      if (parts.length >= 2) {
        document.body.classList.add('navigating');
        setTimeout(function() {
          window.location.href = '/github/' + parts[0] + '/' + parts[1];
        }, 300);
      }`}
    });

    // If we're navigating away (form POST redirect), show fade
    window.addEventListener('beforeunload', function() {
      document.body.classList.add('navigating');
      var bar = document.getElementById('loadingBar');
      if (bar) bar.classList.add('done');
    });

    // Reset loading state when navigating back (bfcache restore)
    window.addEventListener('pageshow', function(e) {
      if (e.persisted) {
        document.body.classList.remove('navigating');
        var btn = document.getElementById('searchBtn');
        var box = document.getElementById('searchBox');
        var bar = document.getElementById('loadingBar');
        if (btn) btn.classList.remove('loading');
        if (box) box.classList.remove('loading');
        if (bar) { bar.classList.remove('active', 'done'); bar.style.width = '0'; }
        document.getElementById('searchInput').readOnly = false;
      }
    });
  </script>
  <script>
    function copySnippet(id) {
      var el = document.getElementById(id);
      var text = el.textContent;
      navigator.clipboard.writeText(text).then(function() {
        var btn = el.parentElement.querySelector('.copy-btn');
        btn.textContent = 'Copied!';
        btn.classList.add('copied');
        setTimeout(function() {
          btn.textContent = 'Copy';
          btn.classList.remove('copied');
        }, 2000);
      });
    }
  </script>
  <script>
    // Hydrate recently checked chips
    fetch('/_data/recent').then(r => r.json()).then(function(queries) {
      if (!queries || !queries.length) return;
      var section = document.getElementById('recentSection');
      var list = document.getElementById('recentList');
      var COLORS = { healthy:'#22c55e', stable:'#eab308', degraded:'#f97316', critical:'#ef4444', unmaintained:'#6b7280' };
      list.innerHTML = queries.map(function(q) {
        var c = COLORS[q.verdict] || '#6b7280';
        return '<a href="/github/' + q.owner + '/' + q.repo + '" class="recent-chip">'
          + '<span class="recent-dot" style="background:' + c + '"></span>'
          + q.owner + '/' + q.repo
          + '<span style="color:var(--text-muted)">' + q.score + '</span>'
          + '</a>';
      }).join('');
      section.style.display = '';
    }).catch(function() {});
  </script>
  ${analyticsToken ? `<script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token":"${analyticsToken}"}'></script>` : ''}
</body>
</html>`;
}
