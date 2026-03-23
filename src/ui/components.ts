// ---------------------------------------------------------------------------
// Shared UI components — navbar + footer with class-based CSS
//
// Every page template should:
// 1. Include ${componentCss} inside their <style> block
// 2. Include ${navbarHtml} at the top of their container
// 3. Include ${footerHtml} at the bottom of their container
// ---------------------------------------------------------------------------

/** Shared CSS for nav + footer — include inside each page's <style> tag */
export const componentCss = `
    /* ── Prevent horizontal scroll from decorative orbs ── */
    html, body { overflow-x: hidden; }

    /* ── iOS safe-area insets (notch, home indicator) ── */
    body {
      padding-top: env(safe-area-inset-top);
      padding-right: env(safe-area-inset-right);
      padding-bottom: env(safe-area-inset-bottom);
      padding-left: env(safe-area-inset-left);
    }

    /* ── Nav / Footer Wrapper ──────────────── */
    .site-chrome-wrapper {
      max-width: 1000px;
      margin: 0 auto;
      padding: 0 24px;
      position: relative;
      z-index: 10;
    }

    /* ── Navbar ─────────────────────────────── */
    .site-nav-outer {
      display: flex;
      justify-content: center;
      padding: 20px 24px 0;
      position: relative;
      z-index: 10;
    }

    .site-nav {
      display: flex;
      align-items: center;
      gap: 10px;
      width: 100%;
      max-width: 1000px;
      background: rgba(255,255,255,0.04);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 16px;
      padding: 12px 20px;
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
    }

    .site-nav-brand {
      font-size: 0.82rem;
      font-weight: 700;
      letter-spacing: 1.5px;
      text-transform: uppercase;
      color: var(--text-primary, #f0f0f5);
      text-decoration: none;
      transition: opacity 0.2s;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      margin-right: 8px;
    }
    .site-nav-brand:hover { opacity: 0.8; }

    .brand-dot {
      width: 7px;
      height: 7px;
      background: #22c55e;
      border-radius: 50%;
      box-shadow: 0 0 6px rgba(34,197,94,0.5);
      flex-shrink: 0;
    }

    .site-nav-divider {
      width: 1px;
      height: 18px;
      background: rgba(255,255,255,0.1);
      margin: 0 4px;
      flex-shrink: 0;
    }

    .site-nav-links-left {
      display: flex;
      gap: 2px;
    }

    .site-nav-links-right {
      display: flex;
      gap: 2px;
      margin-left: auto;
    }

    .site-nav-link {
      color: var(--text-secondary, #9d9db5);
      text-decoration: none;
      font-size: 0.82rem;
      font-weight: 500;
      padding: 6px 16px;
      border-radius: 99px;
      transition: color 0.2s, background 0.2s;
    }
    .site-nav-link:hover {
      color: var(--text-primary, #f0f0f5);
      background: rgba(255,255,255,0.06);
    }

    .site-nav-github {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 34px;
      height: 34px;
      border-radius: 50%;
      color: var(--text-secondary, #9d9db5);
      background: rgba(255,255,255,0.04);
      transition: color 0.2s, background 0.2s;
      margin-left: 4px;
      flex-shrink: 0;
    }
    .site-nav-github:hover {
      color: var(--text-primary, #f0f0f5);
      background: rgba(255,255,255,0.1);
    }
    .site-nav-github svg {
      width: 18px;
      height: 18px;
      fill: currentColor;
    }

    @media (max-width: 768px) {
      .site-nav {
        padding: 8px 12px;
        gap: 4px;
      }
      .site-nav-brand { margin-right: 4px; font-size: 0.75rem; letter-spacing: 1px; }
      .site-nav-link { font-size: 0.75rem; padding: 5px 8px; }
      .site-nav-github { width: 30px; height: 30px; }
      .site-nav-github svg { width: 15px; height: 15px; }
    }

    @media (max-width: 480px) {
      .site-nav-outer { padding: 12px 16px 0; }
      .site-nav {
        flex-wrap: wrap;
        justify-content: center;
        border-radius: 20px;
        padding: 10px 14px;
        gap: 2px;
      }
      .site-nav-brand { width: 100%; justify-content: center; margin-right: 0; margin-bottom: 4px; }
      .site-nav-divider { display: none; }
      .site-nav-links-left, .site-nav-links-right { justify-content: center; flex-wrap: wrap; }
      .site-nav-link { font-size: 0.72rem; padding: 4px 8px; }
    }

    /* ── Footer ─────────────────────────────── */
    .site-footer {
      position: relative;
      z-index: 10;
      max-width: 1000px;
      margin: 0 auto;
      padding: 60px 24px 40px;
    }

    .footer-top {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 48px;
      padding-bottom: 32px;
      border-bottom: 1px solid rgba(255,255,255,0.06);
    }

    .footer-brand {
      flex-shrink: 0;
    }

    .footer-logo {
      font-size: 0.82rem;
      font-weight: 700;
      letter-spacing: 1.5px;
      text-transform: uppercase;
      color: var(--text-primary, #f0f0f5);
      text-decoration: none;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      transition: opacity 0.2s;
    }
    .footer-logo:hover { opacity: 0.8; }

    .footer-logo .brand-dot {
      width: 6px;
      height: 6px;
    }

    .footer-tagline {
      margin-top: 8px;
      font-size: 0.8rem;
      color: var(--text-muted, #64648a);
      max-width: 240px;
      line-height: 1.5;
    }

    .footer-links {
      display: flex;
      gap: 48px;
    }

    .footer-col {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .footer-col-title {
      font-size: 0.72rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: var(--text-secondary, #9d9db5);
      margin-bottom: 4px;
    }

    .footer-col a {
      color: var(--text-muted, #64648a);
      text-decoration: none;
      font-size: 0.82rem;
      transition: color 0.2s;
    }
    .footer-col a:hover { color: var(--text-primary, #f0f0f5); }

    .footer-bottom {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-top: 20px;
      font-size: 0.72rem;
      color: var(--text-muted, #64648a);
      opacity: 0.7;
    }

    @media (max-width: 768px) {
      .footer-top { flex-direction: column; gap: 32px; }
      .footer-links { gap: 32px; }
    }

    @media (max-width: 480px) {
      .site-footer { padding: 40px 20px 32px; }
      .footer-links { gap: 24px; flex-wrap: wrap; }
      .footer-bottom { flex-direction: column; gap: 4px; text-align: center; }
    }

    /* ── Shared: Deps Summary Cards ────────── */
    .deps-summary-cards {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
      gap: 12px;
      margin-bottom: 24px;
    }

    .deps-summary-card {
      background: var(--surface, rgba(255,255,255,0.06));
      border: 1px solid var(--border, rgba(255,255,255,0.10));
      border-radius: 14px;
      padding: 16px;
      text-align: center;
      transition: border-color 0.2s;
    }

    .deps-summary-card:hover { border-color: rgba(255,255,255,0.18); }

    .deps-summary-card-value {
      font-size: 1.5rem;
      font-weight: 700;
      line-height: 1;
      margin-bottom: 4px;
    }

    .deps-summary-card-label {
      font-size: 0.72rem;
      color: var(--text-muted, #64648a);
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    /* ── Shared: Deps Table ─────────────────── */
    .deps-section-card {
      background: var(--surface, rgba(255,255,255,0.06));
      border: 1px solid var(--border, rgba(255,255,255,0.10));
      border-radius: 16px;
      padding: 24px;
      margin-bottom: 24px;
    }

    .deps-section-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
    }

    .deps-section-header h2 {
      font-size: 1rem;
      font-weight: 600;
      color: var(--text-secondary, #9d9db5);
    }

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
      color: var(--text-muted, #64648a);
      padding: 8px 0;
      border-bottom: 1px solid var(--border, rgba(255,255,255,0.10));
    }

    .deps-table th:nth-child(2),
    .deps-table th:nth-child(4) { text-align: center; }

    .dep-row { transition: background 0.15s; }
    .dep-row:hover { background: var(--surface-hover, rgba(255,255,255,0.12)); }

    .dep-row td {
      padding: 10px 0;
      border-bottom: 1px solid rgba(255,255,255,0.04);
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
      color: var(--text-muted, #64648a);
      font-family: 'SF Mono', 'Fira Code', monospace;
    }

    .dev-badge {
      font-size: 0.65rem;
      background: rgba(139,139,158,0.15);
      color: var(--text-muted, #64648a);
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
      color: var(--accent, #6366f1);
      text-decoration: none;
      font-weight: 600;
      font-size: 1rem;
      transition: opacity 0.2s;
    }

    .dep-link:hover { opacity: 0.7; }

    .unresolved-hint {
      color: var(--text-muted, #64648a);
      cursor: help;
      font-size: 0.85rem;
    }

    /* ── Shared: Sort Buttons ──────────────── */
    .deps-sort {
      display: flex;
      gap: 8px;
    }

    .sort-btn {
      background: none;
      border: 1px solid var(--border, rgba(255,255,255,0.10));
      color: var(--text-muted, #64648a);
      padding: 4px 12px;
      border-radius: 8px;
      font-size: 0.72rem;
      font-family: 'Inter', sans-serif;
      cursor: pointer;
      transition: all 0.2s;
    }

    .sort-btn:hover { border-color: rgba(255,255,255,0.2); color: var(--text-secondary, #9d9db5); }
    .sort-btn.active { border-color: var(--accent, #6366f1); color: var(--accent, #6366f1); }

    /* ── Shared: Dev Deps Toggle ────────────── */
    .dev-toggle {
      background: none;
      border: 1px solid var(--border, rgba(255,255,255,0.10));
      color: var(--text-secondary, #9d9db5);
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
    .dev-deps-content { display: none; margin-top: 12px; }
    .dev-deps-content.visible { display: block; }
    .dev-toggle .arrow { transition: transform 0.2s; display: inline-block; }
    .dev-toggle.expanded .arrow { transform: rotate(90deg); }

    /* ── Shared: CTA Section ────────────────── */
    .cta-section {
      background: linear-gradient(135deg, rgba(99,102,241,0.08) 0%, rgba(139,92,246,0.08) 100%);
      border: 1px solid rgba(99,102,241,0.2);
      border-radius: 16px;
      padding: 32px;
      text-align: center;
      margin-bottom: 24px;
    }

    .cta-section h2 { font-size: 1.2rem; font-weight: 700; margin-bottom: 8px; }

    .cta-section p {
      color: var(--text-secondary, #9d9db5);
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
      background: var(--accent, #6366f1);
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
      color: var(--text-muted, #64648a);
    }

    /* ── Shared: Shimmer Animation ──────────── */
    @keyframes shimmer {
      0% { background-position: -200% 0; }
      100% { background-position: 200% 0; }
    }

    .deps-shimmer {
      background: linear-gradient(90deg, var(--surface, rgba(255,255,255,0.06)) 25%, rgba(255,255,255,0.1) 50%, var(--surface, rgba(255,255,255,0.06)) 75%);
      background-size: 200% 100%;
      animation: shimmer 1.5s ease-in-out infinite;
      border-radius: 12px;
      padding: 24px;
      text-align: center;
      color: var(--text-muted, #64648a);
      font-size: 0.85rem;
      min-height: 100px;
      display: flex;
      align-items: center;
      justify-content: center;
      border: 1px solid var(--border, rgba(255,255,255,0.10));
      margin-bottom: 24px;
    }

    /* ── Shared: Incomplete Notice ──────────── */
    .deps-incomplete-notice {
      background: rgba(234,179,8,0.08);
      border: 1px solid rgba(234,179,8,0.2);
      color: #fbbf24;
      padding: 12px 20px;
      border-radius: 12px;
      font-size: 0.85rem;
      margin-bottom: 24px;
      text-align: center;
    }

    /* ── Shared: Responsive for deps ────────── */
    @media (max-width: 640px) {
      .deps-summary-cards { grid-template-columns: repeat(2, 1fr); }
      .deps-section-card { padding: 16px; }
      .deps-table th:nth-child(3),
      .dep-verdict { display: none; }
      .dep-row td { padding: 8px 0; font-size: 0.8rem; }
      .cta-section { padding: 24px 16px; }
    }
`;

/** GitHub SVG icon (16px Octicon) */
const githubSvg = `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>`;

/** Navbar HTML — floating glassmorphism bar */
export const navbarHtml = `
  <div class="site-nav-outer">
    <nav class="site-nav">
      <a href="/" class="site-nav-brand"><span class="brand-dot"></span>Is It Alive</a>
      <span class="site-nav-divider"></span>
      <div class="site-nav-links-left">
        <a href="/trending" class="site-nav-link">Trending</a>
        <a href="/methodology" class="site-nav-link">Methodology</a>
      </div>
      <div class="site-nav-links-right">
        <a href="/api" class="site-nav-link">API</a>
        <a href="/changelog" class="site-nav-link">Changelog</a>
        <a href="https://github.com/isitalive/isitalive" class="site-nav-github" aria-label="GitHub" target="_blank" rel="noopener">${githubSvg}</a>
      </div>
    </nav>
  </div>
`;

/** Footer HTML — structured two-row layout */
export const footerHtml = `
  <footer class="site-footer">
    <div class="footer-top">
      <div class="footer-brand">
        <a href="/" class="footer-logo"><span class="brand-dot"></span>Is It Alive</a>
        <p class="footer-tagline">Open-source health, one score at a time.</p>
      </div>
      <div class="footer-links">
        <div class="footer-col">
          <div class="footer-col-title">Product</div>
          <a href="/">Home</a>
          <a href="/trending">Trending</a>
          <a href="/api">API Docs</a>
        </div>
        <div class="footer-col">
          <div class="footer-col-title">Resources</div>
          <a href="/methodology">Methodology</a>
          <a href="/changelog">Changelog</a>
          <a href="/terms">Terms</a>
        </div>
        <div class="footer-col">
          <div class="footer-col-title">Community</div>
          <a href="https://github.com/isitalive/isitalive" target="_blank" rel="noopener">GitHub</a>
        </div>
      </div>
    </div>
    <div class="footer-bottom">
      <span>&copy; ${new Date().getFullYear()} Is It Alive</span>
      <span>Built with Cloudflare Workers &amp; Hono</span>
    </div>
  </footer>
`;
