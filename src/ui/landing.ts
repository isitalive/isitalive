// ---------------------------------------------------------------------------
// Landing page HTML — super simple dark/light design
// ---------------------------------------------------------------------------

import { navbarHtml, footerHtml, componentCss, themeCss, themeScript, themeHeadScript } from './components';
import { ogTags } from './og';
import { analyticsScript } from './analytics';

export function landingPage(siteKey?: string, analyticsToken?: string): string {
  const hasTurnstile = !!siteKey;
  return `<!DOCTYPE html>
<html lang="en" data-theme="system">
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
      max-width: 1000px;
      margin: 0 auto;
      padding: 0 24px;
    }

    /* ── Header ─────────────────────────────── */
    header {
      text-align: center;
      padding: 100px 0 10px;
    }

    h1 {
      font-size: clamp(2.5rem, 6vw, 4rem);
      font-weight: 800;
      line-height: 1.1;
      letter-spacing: -0.03em;
      margin-bottom: 20px;
      color: var(--text-primary);
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
      margin-top: 40px;
      display: flex;
      flex-direction: column;
      align-items: center;
      width: 100%;
    }

    .search-box {
      position: relative;
      background: var(--bg-primary);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 6px;
      width: 100%;
      display: flex;
      align-items: center;
      gap: 0;
      overflow: hidden;
      z-index: 0;
    }

    .search-box::before {
      content: '';
      position: absolute;
      inset: -2px;
      border-radius: 8px;
      background: conic-gradient(
        from var(--glow-angle, 0deg),
        transparent 0%,
        var(--accent) 5%,
        var(--accent) 35%,
        transparent 40%,
        transparent 100%
      );
      animation: glow-rotate 4s linear infinite;
      z-index: -1;
      opacity: 0.4;
    }

    .search-box::after {
      content: '';
      position: absolute;
      inset: 2px;
      border-radius: 4px;
      background: var(--bg-primary);
      z-index: -1;
    }

    @keyframes glow-rotate {
      to {
        --glow-angle: 360deg;
      }
    }

    @property --glow-angle {
      syntax: '<angle>';
      initial-value: 0deg;
      inherits: false;
    }

    .search-box:focus-within::before {
      opacity: 0.8;
    }

    #searchForm {
      width: 100%;
      max-width: 680px;
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
      font-size: 1.05rem;
      padding: 14px 20px;
      caret-color: var(--accent);
    }

    .search-box input::placeholder {
      color: var(--text-muted);
    }

    .search-box button {
      background: var(--accent);
      color: var(--accent-text);
      border: none;
      border-radius: 4px;
      padding: 14px 28px;
      font-family: 'Inter', sans-serif;
      font-size: 0.92rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
      white-space: nowrap;
    }

    .search-box button:hover { background: var(--accent-hover); }
    .search-box button:active { transform: scale(0.97); }

    .search-hint {
      text-align: center;
      margin-top: 14px;
      font-size: 0.82rem;
      color: var(--text-muted);
    }

    .search-examples {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: 8px;
      margin-top: 12px;
    }

    .search-example {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      background: transparent;
      border: 1px solid var(--border);
      border-radius: 4px;
      padding: 6px 14px;
      font-size: 0.78rem;
      color: var(--text-secondary);
      text-decoration: none;
      cursor: pointer;
      transition: border-color 0.2s, color 0.2s;
      font-family: 'SF Mono', 'Fira Code', monospace;
    }

    .search-example:hover {
      border-color: var(--accent);
      color: var(--text-primary);
    }

    .search-example-label {
      font-family: 'Inter', sans-serif;
      color: var(--text-muted);
      font-size: 0.72rem;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    /* ── Recent queries ──────────────────────── */
    .recent-section {
      margin-top: 16px;
      margin-bottom: 20px;
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
      background: transparent;
      border: 1px solid var(--border);
      border-radius: 4px;
      padding: 6px 14px;
      text-decoration: none;
      color: var(--text-secondary);
      font-size: 0.78rem;
      transition: border-color 0.2s, color 0.2s;
    }

    .recent-chip:hover {
      border-color: var(--text-muted);
      color: var(--text-primary);
    }

    .recent-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      flex-shrink: 0;
    }

    /* ── Adoption Section ──────────────────── */
    .adopt-section {
      padding: 64px 0 48px;
    }

    .adopt-section .section-label {
      display: flex;
      align-items: center;
      gap: 0;
      text-transform: uppercase;
      font-size: 0.72rem;
      font-weight: 600;
      letter-spacing: 2px;
      color: var(--text-muted);
      margin-bottom: 40px;
    }

    .adopt-section .section-label::before,
    .adopt-section .section-label::after {
      content: '';
      flex: 1;
      height: 1px;
      background: var(--border);
    }

    .adopt-section .section-label span {
      padding: 0 24px;
    }

    .adopt-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 20px;
    }

    .adopt-block {
      background: transparent;
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 32px 28px;
      display: flex;
      flex-direction: column;
      transition: transform 0.25s ease, border-color 0.25s ease;
    }

    .adopt-block:hover {
      transform: translateY(-4px);
      border-color: var(--text-muted);
    }

    .adopt-block:last-child {
      grid-column: 1 / -1;
    }

    .adopt-header {
      display: flex;
      align-items: center;
      gap: 14px;
      margin-bottom: 8px;
    }

    .adopt-icon {
      width: 44px;
      height: 44px;
      border-radius: 6px;
      display: flex;
      flex-shrink: 0;
      align-items: center;
      justify-content: center;
    }

    .adopt-icon svg {
      width: 22px;
      height: 22px;
    }

    .adopt-icon.icon-badge,
    .adopt-icon.icon-shield,
    .adopt-icon.icon-bot {
      background: transparent;
      color: var(--text-secondary);
      border: 1px solid var(--border);
    }

    .adopt-block h3 {
      font-size: 1.1rem;
      font-weight: 600;
      margin: 0;
    }

    .adopt-block > p {
      color: var(--text-secondary);
      font-size: 0.82rem;
      margin-bottom: 20px;
      line-height: 1.5;
    }

    .adopt-code {
      background: transparent;
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 20px;
      font-family: 'SF Mono', 'Fira Code', monospace;
      font-size: 0.72rem;
      line-height: 1.7;
      color: var(--text-secondary);
      overflow-x: auto;
      position: relative;
      white-space: pre;
      flex: 1;
    }

    .adopt-code .cm { color: var(--text-muted); }
    .adopt-code .ac { color: var(--text-primary); }
    .adopt-code .gr { color: var(--green); }

    .copy-btn {
      position: absolute;
      top: 12px;
      right: 12px;
      background: transparent;
      border: 1px solid var(--border);
      color: var(--text-secondary);
      border-radius: 6px;
      padding: 4px 10px;
      font-size: 0.65rem;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.2s, color 0.2s;
    }

    .copy-btn:hover { background: var(--accent); color: var(--accent-text); border-color: var(--accent); }
    .copy-btn.copied { background: var(--green); color: #fff; border-color: var(--green); }

    .adopt-tag {
      display: inline-block;
      margin-top: 14px;
      font-size: 0.7rem;
      color: var(--text-muted);
    }

    .adopt-tag a {
      color: var(--text-secondary);
      text-decoration: none;
    }

    .adopt-tag a:hover { text-decoration: underline; }

    /* ── Closing CTA ───────────────────────── */
    .closing-cta {
      text-align: center;
      padding: 80px 0;
      border-top: 1px solid var(--border);
    }

    .closing-cta h2 {
      font-size: 1.8rem;
      font-weight: 600;
      margin-bottom: 24px;
    }

    .closing-cta .cta-btn {
      display: inline-block;
      background: var(--accent);
      color: var(--accent-text);
      border: none;
      border-radius: 4px;
      padding: 14px 36px;
      font-size: 0.88rem;
      font-weight: 600;
      text-decoration: none;
      text-transform: uppercase;
      letter-spacing: 1px;
      transition: transform 0.2s;
      margin-bottom: 16px;
    }

    .closing-cta .cta-btn:hover {
      transform: translateY(-2px);
    }

    .closing-cta .cta-sub {
      font-size: 0.78rem;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 1px;
    }

    /* ── Responsive ─────────────────────────── */
    @media (max-width: 768px) {
      .adopt-grid { grid-template-columns: 1fr; }
      .adopt-block:last-child { grid-column: auto; }
    }

    @media (max-width: 640px) {
      .container { padding: 0 20px; }
      header { padding: 60px 0 10px; }
      h1 { font-size: 1.8rem; }
      .subtitle { font-size: 0.9rem; }

      .search-box {
        flex-direction: column;
        padding: 8px;
        border-radius: 6px;
      }
      .search-box input {
        width: 100%;
        padding: 14px 16px;
        font-size: 1rem;
      }
      .search-box button {
        width: 100%;
        border-radius: 4px;
        padding: 14px 24px;
        font-size: 0.9rem;
      }
    }

    /* ── Loading transition ──────────────────── */
    .loading-bar {
      position: fixed;
      top: 0;
      left: 0;
      height: 3px;
      background: linear-gradient(90deg, var(--text-muted), var(--text-secondary), var(--text-muted));
      background-size: 200% 100%;
      width: 0;
      z-index: 9999;
      transition: width 0.4s ease;
      animation: loadShimmer 1.5s ease-in-out infinite;
    }

    @keyframes loadShimmer {
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
      display: inline-flex;
      gap: 4px;
      align-items: center;
      justify-content: center;
    }

    .search-box button.loading .btn-spinner::before,
    .search-box button.loading .btn-spinner::after,
    .search-box button.loading .btn-spinner {
      font-size: 0;
    }

    .search-box button.loading .btn-spinner::before {
      content: '';
      display: block;
      width: 6px; height: 6px;
      border-radius: 50%;
      background: var(--accent-text);
      animation: dotPulse 1.2s ease-in-out infinite;
    }

    .search-box button.loading .btn-spinner::after {
      content: '';
      display: block;
      width: 6px; height: 6px;
      border-radius: 50%;
      background: var(--accent-text);
      animation: dotPulse 1.2s ease-in-out 0.4s infinite;
    }

    .search-box button.loading {
      pointer-events: none;
      opacity: 0.8;
      min-width: 140px;
    }

    @keyframes dotPulse {
      0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); }
      40% { opacity: 1; transform: scale(1); }
    }

    body.navigating {
      opacity: 0.6;
      transition: opacity 0.3s ease;
    }
  </style>
</head>
<body>

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
              placeholder="${['vercel/next.js', 'facebook/react', 'golang/go', 'zitadel/zitadel', 'tailwindlabs/tailwindcss'][Math.floor(Math.random() * 5)]}"
              required
              autofocus
            />
            <button type="submit" id="searchBtn">
              <span class="btn-text">Check Health</span>
              <span class="btn-spinner"></span>
            </button>
          </div>
          ${hasTurnstile ? `<div class="cf-turnstile" data-sitekey="${siteKey}" data-theme="auto" data-size="flexible" data-callback="onTurnstileSuccess" data-expired-callback="onTurnstileExpired"></div>` : ''}
        </form>
        <p class="search-hint">Paste any GitHub repo or pick a recently checked project</p>
      </div>
    </header>

    <div class="recent-section" id="recentSection">
      <div class="recent-list" id="recentList">
        <a href="/github/vercel/next.js" class="recent-chip"><span class="recent-dot" style="background:#22c55e"></span>vercel/next.js<span style="color:var(--text-muted)">92</span></a>
        <a href="/github/facebook/react" class="recent-chip"><span class="recent-dot" style="background:#22c55e"></span>facebook/react<span style="color:var(--text-muted)">88</span></a>
        <a href="/github/golang/go" class="recent-chip"><span class="recent-dot" style="background:#22c55e"></span>golang/go<span style="color:var(--text-muted)">95</span></a>
        <a href="/github/zitadel/zitadel" class="recent-chip"><span class="recent-dot" style="background:#22c55e"></span>zitadel/zitadel<span style="color:var(--text-muted)">85</span></a>
        <a href="/github/tailwindlabs/tailwindcss" class="recent-chip"><span class="recent-dot" style="background:#22c55e"></span>tailwindlabs/tailwindcss<span style="color:var(--text-muted)">90</span></a>
      </div>
    </div>

    <section class="adopt-section">
      <div class="section-label"><span>Add it to your project</span></div>
      <div class="adopt-grid">
        <div class="adopt-block">
          <div class="adopt-header">
            <div class="adopt-icon icon-badge"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg></div>
            <h3>Show your score</h3>
          </div>
          <p>One line in your README. Live badge, auto-updated.</p>
          <div style="margin-bottom:12px"><svg xmlns="http://www.w3.org/2000/svg" width="182" height="20" role="img" aria-label="is it alive?: 92 · healthy"><title>is it alive?: 92 · healthy</title><linearGradient id="bg" x2="0" y2="100%"><stop offset="0" stop-color="#bbb" stop-opacity=".1"/><stop offset="1" stop-opacity=".1"/></linearGradient><clipPath id="cr"><rect width="182" height="20" rx="3" fill="#fff"/></clipPath><g clip-path="url(#cr)"><rect width="80" height="20" fill="#555"/><rect x="80" width="102" height="20" fill="#22c55e"/><rect width="182" height="20" fill="url(#bg)"/></g><g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" text-rendering="geometricPrecision" font-size="110"><text x="400" y="150" fill="#010101" fill-opacity=".3" transform="scale(.1)" textLength="700">is it alive?</text><text x="400" y="140" transform="scale(.1)" textLength="700">is it alive?</text><text x="1310" y="150" fill="#010101" fill-opacity=".3" transform="scale(.1)" textLength="920">92 · healthy</text><text x="1310" y="140" transform="scale(.1)" textLength="920">92 · healthy</text></g></svg></div>
          <div class="adopt-code" id="badgeSnippet"><button class="copy-btn" onclick="copySnippet('badgeSnippet')">Copy</button><span class="gr">[![Is It Alive?]</span>
<span class="gr">(https://isitalive.dev/api/badge/github/ORG/REPO)]</span>
<span class="gr">(https://isitalive.dev/github/ORG/REPO)</span></div>
          <span class="adopt-tag">Works with any public repo — no setup needed</span>
        </div>
        <div class="adopt-block">
          <div class="adopt-header">
            <div class="adopt-icon icon-shield"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg></div>
            <h3>Guard your dependencies</h3>
          </div>
          <p>Fail the build when a dependency drops below your threshold.</p>
          <div class="adopt-code" id="actionSnippet"><button class="copy-btn" onclick="copySnippet('actionSnippet')">Copy</button><span class="cm"># .github/workflows/deps.yml</span>
<span class="ac">- uses:</span> isitalive/audit-action@v1
  <span class="ac">with:</span>
    <span class="ac">threshold:</span> 40</div>
          <span class="adopt-tag">Free for public repos · <a href="https://github.com/isitalive/audit-action">GitHub Action</a> · <a href="/api">Docs →</a></span>
        </div>
        <div class="adopt-block">
          <div class="adopt-header">
            <div class="adopt-icon icon-bot"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M15 2v2"/><path d="M15 20v2"/><path d="M2 15h2"/><path d="M2 9h2"/><path d="M20 15h2"/><path d="M20 9h2"/><path d="M9 2v2"/><path d="M9 20v2"/></svg></div>
            <h3>Enable AI agents</h3>
          </div>
          <p>Let any LLM or MCP server check dependency health with one API call.</p>
          <div class="adopt-code"><span class="ac">$</span> curl https://isitalive.dev/api/check/\\
  github/vercel/next.js

{ <span class="gr">"score"</span>: 92,
  <span class="gr">"verdict"</span>: <span class="gr">"healthy"</span>,
  <span class="gr">"signals"</span>: [...] }</div>
          <span class="adopt-tag"><a href="/llms.txt">llms.txt</a> · <a href="/openapi.json">openapi.json</a> · <a href="/.well-known/ai-plugin.json">ai-plugin.json</a></span>
        </div>
      </div>
    </section>

    <section class="closing-cta">
      <h2>Ready to ship with confidence?</h2>
      <a href="/methodology" class="cta-btn">How we calculate scores →</a>
      <p class="cta-sub">Free for open source. No credit card required.</p>
    </section>

  </div>

  ${footerHtml}

  <div class="loading-bar" id="loadingBar"></div>

  ${hasTurnstile ? '<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>' : ''}
  <script>
    // Track whether Turnstile token is ready (set by data-callback / data-expired-callback)
    var turnstileReady = ${hasTurnstile ? 'false' : 'true'};
    function onTurnstileSuccess() { turnstileReady = true; }
    function onTurnstileExpired() { turnstileReady = false; if (typeof turnstile !== 'undefined') turnstile.reset(); }

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

      ${hasTurnstile ? `
      // If Turnstile token is not ready (e.g. after back-nav reset), wait for it
      if (!turnstileReady) {
        e.preventDefault();
        var form = this;
        var formInput = input;
        var attempts = 0;
        var waitForToken = setInterval(function() {
          attempts++;
          if (turnstileReady || attempts > 50) {
            clearInterval(waitForToken);
            if (turnstileReady) { form.submit(); }
            else {
              // Turnstile failed (e.g. preview domain) — fallback to client-side redirect
              var path = formInput
                .replace(/^https?:\\/\\//, '')
                .replace(/^(www\\.)?github\\.com\\//, '')
                .replace(/\\.git$/, '').replace(/\\/+$/, '');
              var parts = path.split('/');
              if (parts.length >= 2) {
                document.body.classList.add('navigating');
                window.location.href = '/github/' + parts[0] + '/' + parts[1];
              } else {
                btn.classList.remove('loading'); box.classList.remove('loading'); bar.classList.remove('active'); document.getElementById('searchInput').readOnly = false;
              }
            }
          }
        }, 100);
        return;
      }
      // Let the form POST with Turnstile token — server handles redirect and manifest detection` : `
      // No Turnstile (local dev) — do client-side redirect
      e.preventDefault();

      // Detect manifest URL: github.com/.../package.json or go.mod (only these filenames)
      var manifestRx = /(?:https?:\\/\\/)?(?:www\\.)?github\\.com\\/.+\\/blob\\/.+\\/(package\\.json|go\\.mod)$/i;
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
        .replace(/^https?:\\\\/\\\\//, '')
        .replace(/^(www\\\\.)?github\\\\.com\\\\//, '')
        .replace(/\\\\.git$/, '').replace(/\\\\/+$/, '');

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

        // Re-render Turnstile widget so a fresh token is generated.
        // The old token was already consumed by the previous form submission.
        turnstileReady = false;
        if (typeof turnstile !== 'undefined') {
          turnstile.reset();
        }
      }
    });
  </script>
  <script>
    function copySnippet(id) {
      var el = document.getElementById(id);
      // Get text content, excluding the button text
      var clone = el.cloneNode(true);
      var btns = clone.querySelectorAll('.copy-btn');
      for (var i = 0; i < btns.length; i++) btns[i].remove();
      var text = clone.textContent.trim();
      navigator.clipboard.writeText(text).then(function() {
        var btn = el.querySelector('.copy-btn');
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
    // Hydrate recently checked chips (replaces mock defaults with real data)
    fetch('/_data/recent').then(r => r.json()).then(function(queries) {
      if (!queries || !queries.length) return;
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
    }).catch(function() {});
  </script>
  ${themeScript}
  ${analyticsScript(analyticsToken)}
</body>
</html>`;
}
