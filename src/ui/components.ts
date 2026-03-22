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
    .site-nav {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 24px 0;
      position: relative;
      z-index: 10;
    }

    .site-nav-brand {
      font-size: 0.8rem;
      font-weight: 700;
      letter-spacing: 2px;
      text-transform: uppercase;
      color: var(--accent, #6366f1);
      text-decoration: none;
      transition: opacity 0.2s;
    }
    .site-nav-brand:hover { opacity: 0.8; }

    .site-nav-links {
      display: flex;
      gap: 20px;
    }

    .site-nav-link {
      color: var(--text-secondary, #8b8b9e);
      text-decoration: none;
      font-size: 0.85rem;
      font-weight: 500;
      transition: color 0.2s;
    }
    .site-nav-link:hover { color: var(--text-primary, #e8e8ed); }

    @media (max-width: 640px) {
      .site-nav { flex-direction: column; gap: 12px; }
      .site-nav-links { gap: 14px; flex-wrap: wrap; justify-content: center; }
      .site-nav-link { font-size: 0.78rem; }
    }

    /* ── Footer ─────────────────────────────── */
    .site-footer {
      text-align: center;
      padding: 80px 0 40px;
      color: var(--text-muted, #55556a);
      font-size: 0.78rem;
      position: relative;
      z-index: 10;
    }

    .site-footer a {
      color: var(--text-secondary, #8b8b9e);
      text-decoration: none;
      transition: color 0.2s;
    }
    .site-footer a:hover { color: var(--accent, #6366f1); }

    .site-footer-credits {
      margin-top: 12px;
      opacity: 0.5;
    }

    /* ── Shared: Deps Summary Cards ────────── */
    .deps-summary-cards {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
      gap: 12px;
      margin-bottom: 24px;
    }

    .deps-summary-card {
      background: var(--surface, rgba(255,255,255,0.04));
      border: 1px solid var(--border, rgba(255,255,255,0.08));
      border-radius: 14px;
      padding: 16px;
      text-align: center;
      transition: border-color 0.2s;
    }

    .deps-summary-card:hover { border-color: rgba(255,255,255,0.15); }

    .deps-summary-card-value {
      font-size: 1.5rem;
      font-weight: 700;
      line-height: 1;
      margin-bottom: 4px;
    }

    .deps-summary-card-label {
      font-size: 0.72rem;
      color: var(--text-muted, #55556a);
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    /* ── Shared: Deps Table ─────────────────── */
    .deps-section-card {
      background: var(--surface, rgba(255,255,255,0.04));
      border: 1px solid var(--border, rgba(255,255,255,0.08));
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
      color: var(--text-secondary, #8b8b9e);
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
      color: var(--text-muted, #55556a);
      padding: 8px 0;
      border-bottom: 1px solid var(--border, rgba(255,255,255,0.08));
    }

    .deps-table th:nth-child(2),
    .deps-table th:nth-child(4) { text-align: center; }

    .dep-row { transition: background 0.15s; }
    .dep-row:hover { background: var(--surface-hover, rgba(255,255,255,0.08)); }

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
      color: var(--text-muted, #55556a);
      font-family: 'SF Mono', 'Fira Code', monospace;
    }

    .dev-badge {
      font-size: 0.65rem;
      background: rgba(139,139,158,0.15);
      color: var(--text-muted, #55556a);
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
      color: var(--text-muted, #55556a);
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
      border: 1px solid var(--border, rgba(255,255,255,0.08));
      color: var(--text-muted, #55556a);
      padding: 4px 12px;
      border-radius: 8px;
      font-size: 0.72rem;
      font-family: 'Inter', sans-serif;
      cursor: pointer;
      transition: all 0.2s;
    }

    .sort-btn:hover { border-color: rgba(255,255,255,0.2); color: var(--text-secondary, #8b8b9e); }
    .sort-btn.active { border-color: var(--accent, #6366f1); color: var(--accent, #6366f1); }

    /* ── Shared: Dev Deps Toggle ────────────── */
    .dev-toggle {
      background: none;
      border: 1px solid var(--border, rgba(255,255,255,0.08));
      color: var(--text-secondary, #8b8b9e);
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
      color: var(--text-secondary, #8b8b9e);
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
      color: var(--text-muted, #55556a);
    }

    /* ── Shared: Shimmer Animation ──────────── */
    @keyframes shimmer {
      0% { background-position: -200% 0; }
      100% { background-position: 200% 0; }
    }

    .deps-shimmer {
      background: linear-gradient(90deg, var(--surface, rgba(255,255,255,0.04)) 25%, rgba(255,255,255,0.08) 50%, var(--surface, rgba(255,255,255,0.04)) 75%);
      background-size: 200% 100%;
      animation: shimmer 1.5s ease-in-out infinite;
      border-radius: 12px;
      padding: 24px;
      text-align: center;
      color: var(--text-muted, #55556a);
      font-size: 0.85rem;
      min-height: 100px;
      display: flex;
      align-items: center;
      justify-content: center;
      border: 1px solid var(--border, rgba(255,255,255,0.08));
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

/** Navbar HTML — self-contained with consistent width wrapper */
export const navbarHtml = `
  <div class="site-chrome-wrapper">
    <nav class="site-nav">
      <a href="/" class="site-nav-brand">Is It Alive</a>
      <div class="site-nav-links">
        <a href="/trending" class="site-nav-link">🔥 Trending</a>
        <a href="/api" class="site-nav-link">📡 API</a>
        <a href="/methodology" class="site-nav-link">📖 Methodology</a>
        <a href="/changelog" class="site-nav-link">📋 Changelog</a>
      </div>
    </nav>
  </div>
`;

/** Footer HTML — self-contained with consistent width wrapper */
export const footerHtml = `
  <div class="site-chrome-wrapper">
    <footer class="site-footer">
      <p>
        <a href="/">Home</a> &nbsp;·&nbsp;
        <a href="/trending">Trending</a> &nbsp;·&nbsp;
        <a href="/api">API</a> &nbsp;·&nbsp;
        <a href="/methodology">Methodology</a> &nbsp;·&nbsp;
        <a href="/changelog">Changelog</a> &nbsp;·&nbsp;
        <a href="/terms">Terms</a> &nbsp;·&nbsp;
        <a href="https://github.com/isitalive/isitalive">GitHub</a>
      </p>
      <p class="site-footer-credits">Built with Cloudflare Workers &amp; Hono</p>
    </footer>
  </div>
`;
