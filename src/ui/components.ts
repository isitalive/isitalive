// ---------------------------------------------------------------------------
// Shared UI components — navbar + footer + theme system
//
// Every page template should:
// 1. Include ${themeCss} inside their <style> block (before componentCss)
// 2. Include ${componentCss} inside their <style> block
// 3. Include ${navbarHtml} at the top of their container
// 4. Include ${footerHtml} at the bottom of their container
// 5. Include ${themeScript} before </body>
// 6. Add data-theme="system" to <html> tag
// ---------------------------------------------------------------------------

// ── Theme CSS ───────────────────────────────────────────────────────────────
// Dark is the default. Light is applied via [data-theme="light"] or
// @media (prefers-color-scheme: light) when [data-theme="system"].
// ---------------------------------------------------------------------------

export const themeCss = `
    /* ── Dark theme (default) ── */
    :root {
      --bg-primary: #09090b;
      --bg-secondary: #111113;
      --surface: #141416;
      --surface-hover: #1c1c1f;
      --border: #27272a;
      --text-primary: #fafafa;
      --text-secondary: #d4d4d8;
      --text-muted: #a1a1aa;
      --accent: #ffffff;
      --accent-hover: #e4e4e7;
      --accent-glow: rgba(255,255,255,0.08);
      --accent-text: #000000;
      --green: #22c55e;
      --yellow: #eab308;
      --orange: #f97316;
      --red: #ef4444;
      --gray: #6b7280;
      --code-bg: #111113;
      color-scheme: dark;
    }

    /* ── Light theme (explicit) ── */
    [data-theme="light"] {
      --bg-primary: #fafafa;
      --bg-secondary: #ffffff;
      --surface: #ffffff;
      --surface-hover: #f4f4f5;
      --border: #e4e4e7;
      --text-primary: #09090b;
      --text-secondary: #52525b;
      --text-muted: #a1a1aa;
      --accent: #000000;
      --accent-hover: #18181b;
      --accent-glow: rgba(0,0,0,0.06);
      --accent-text: #ffffff;
      --green: #16a34a;
      --yellow: #ca8a04;
      --orange: #ea580c;
      --red: #dc2626;
      --gray: #6b7280;
      --code-bg: #f4f4f5;
      color-scheme: light;
    }

    /* ── System theme: follow OS preference ── */
    @media (prefers-color-scheme: light) {
      [data-theme="system"] {
        --bg-primary: #fafafa;
        --bg-secondary: #ffffff;
        --surface: #ffffff;
        --surface-hover: #f4f4f5;
        --border: #e4e4e7;
        --text-primary: #09090b;
        --text-secondary: #52525b;
        --text-muted: #a1a1aa;
        --accent: #000000;
        --accent-hover: #18181b;
        --accent-glow: rgba(0,0,0,0.06);
        --accent-text: #ffffff;
        --green: #16a34a;
        --yellow: #ca8a04;
        --orange: #ea580c;
        --red: #dc2626;
        --gray: #6b7280;
        --code-bg: #f4f4f5;
        color-scheme: light;
      }
    }
`;

// ── Theme toggle script ─────────────────────────────────────────────────────
// Inline before </body>. Prevents FOUC by reading localStorage early.
// Cycles: system → dark → light → system
// ---------------------------------------------------------------------------

export const themeScript = `
  <script>
    (function() {
      var MODES = ['system', 'dark', 'light'];
      var ICONS = { system: '◐', dark: '☾', light: '☀' };
      var LABELS = { system: 'System', dark: 'Dark', light: 'Light' };

      function getStored() {
        try { return localStorage.getItem('theme') || 'system'; } catch(e) { return 'system'; }
      }

      function apply(mode) {
        document.documentElement.setAttribute('data-theme', mode);
        var btn = document.getElementById('themeToggle');
        if (btn) {
          btn.querySelector('.theme-icon').textContent = ICONS[mode];
          btn.querySelector('.theme-label').textContent = LABELS[mode];
        }
      }

      function cycle() {
        var current = getStored();
        var next = MODES[(MODES.indexOf(current) + 1) % MODES.length];
        try { localStorage.setItem('theme', next); } catch(e) {}
        apply(next);
      }

      // Apply immediately
      apply(getStored());

      // Bind toggle
      document.addEventListener('DOMContentLoaded', function() {
        var btn = document.getElementById('themeToggle');
        if (btn) btn.addEventListener('click', cycle);

        // Hamburger menu toggle
        var ham = document.getElementById('navHamburger');
        var nav = document.getElementById('siteNav');
        if (ham && nav) {
          ham.addEventListener('click', function() {
            nav.classList.toggle('open');
            ham.textContent = nav.classList.contains('open') ? '\u2715' : '\u2630';
          });
        }
      });
    })();
  </script>
`;

// ── FOUC prevention script ──────────────────────────────────────────────────
// Inline in <head> to set data-theme before first paint
// ---------------------------------------------------------------------------

export const themeHeadScript = `
  <script>
    (function() {
      try {
        var t = localStorage.getItem('theme') || 'system';
        document.documentElement.setAttribute('data-theme', t);
      } catch(e) {
        document.documentElement.setAttribute('data-theme', 'system');
      }
    })();
  </script>
`;

/** Shared CSS for nav + footer — include inside each page's <style> tag */
export const componentCss = `
    /* ── Prevent horizontal scroll (clip preserves sticky) ── */
    html, body { overflow-x: clip; }

    /* ── iOS safe-area insets (notch, home indicator) ── */
    body {
      padding-top: env(safe-area-inset-top);
      padding-right: env(safe-area-inset-right);
      padding-bottom: env(safe-area-inset-bottom);
      padding-left: env(safe-area-inset-left);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
    }

    /* ── Sticky footer: main content fills available space ── */
    .container { flex: 1; width: 100%; }

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
      padding: 16px 24px 24px;
      position: sticky;
      top: 0;
      z-index: 100;
      -webkit-backdrop-filter: blur(24px) saturate(180%);
      backdrop-filter: blur(24px) saturate(180%);
      -webkit-mask-image: linear-gradient(to bottom, black 50%, transparent 100%);
      mask-image: linear-gradient(to bottom, black 50%, transparent 100%);
    }

    .site-nav {
      display: flex;
      align-items: center;
      gap: 10px;
      width: 100%;
      max-width: 1000px;
      background: rgba(255,255,255,0.08);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 6px;
      padding: 12px 20px;
      box-shadow:
        inset 1px 1px 0 0 rgba(255,255,255,0.1),
        0 2px 8px rgba(0,0,0,0.06);
    }

    [data-theme="light"] .site-nav,
    [data-theme="system"] .site-nav {
      background: rgba(0,0,0,0.04);
      border-color: rgba(0,0,0,0.06);
      box-shadow:
        inset 1px 1px 0 0 rgba(255,255,255,0.6),
        0 2px 8px rgba(0,0,0,0.03);
    }
    @media (prefers-color-scheme: dark) {
      [data-theme="system"] .site-nav {
        background: rgba(255,255,255,0.08);
        border-color: rgba(255,255,255,0.1);
        box-shadow:
          inset 1px 1px 0 0 rgba(255,255,255,0.1),
          0 2px 8px rgba(0,0,0,0.06);
      }
    }

    .site-nav-brand {
      font-size: 0.82rem;
      font-weight: 700;
      letter-spacing: 1.5px;
      text-transform: uppercase;
      color: var(--text-primary);
      text-decoration: none;
      transition: opacity 0.2s;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      margin-right: 8px;
    }
    .site-nav-brand:hover { opacity: 0.7; }

    .brand-dot {
      width: 7px;
      height: 7px;
      background: var(--green);
      border-radius: 50%;
      flex-shrink: 0;
    }

    .site-nav-divider {
      width: 1px;
      height: 18px;
      background: var(--border);
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
      align-items: center;
    }

    .site-nav-link {
      color: var(--text-secondary);
      text-decoration: none;
      font-size: 0.82rem;
      font-weight: 500;
      padding: 6px 16px;
      border-radius: 4px;
      transition: color 0.2s, background 0.2s;
    }
    .site-nav-link:hover {
      color: var(--text-primary);
      background: var(--surface-hover);
    }

    .site-nav-github {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 34px;
      height: 34px;
      border-radius: 50%;
      color: var(--text-secondary);
      background: transparent;
      transition: color 0.2s, background 0.2s;
      margin-left: 4px;
      flex-shrink: 0;
    }
    .site-nav-github:hover {
      color: var(--text-primary);
      background: var(--surface-hover);
    }
    .site-nav-github svg {
      width: 18px;
      height: 18px;
      fill: currentColor;
    }

    /* ── Theme toggle ──────────────────────── */
    .theme-toggle {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      background: transparent;
      border: 1px solid var(--border);
      color: var(--text-secondary);
      border-radius: 4px;
      padding: 5px 12px;
      font-size: 0.72rem;
      font-family: 'Inter', sans-serif;
      font-weight: 500;
      cursor: pointer;
      transition: color 0.2s, border-color 0.2s;
      margin-left: 4px;
      flex-shrink: 0;
      user-select: none;
    }
    .theme-toggle:hover {
      color: var(--text-primary);
      border-color: var(--text-muted);
    }
    .theme-icon { font-size: 0.85rem; }

    @media (max-width: 768px) {
      .site-nav {
        padding: 8px 12px;
        gap: 4px;
      }
      .site-nav-brand { margin-right: 4px; font-size: 0.75rem; letter-spacing: 1px; }
      .site-nav-link { font-size: 0.75rem; padding: 5px 8px; }
      .site-nav-github { width: 30px; height: 30px; }
      .site-nav-github svg { width: 15px; height: 15px; }
      .theme-label { display: none; }
      .theme-toggle { padding: 5px 8px; }
    }

    /* ── Hamburger toggle (hidden on desktop) ── */
    .nav-hamburger {
      display: none;
      background: none;
      border: 1px solid var(--border);
      color: var(--text-secondary);
      border-radius: 4px;
      padding: 4px 8px;
      font-size: 1.1rem;
      line-height: 1;
      cursor: pointer;
      flex-shrink: 0;
      font-family: inherit;
      transition: color 0.2s, border-color 0.2s;
    }
    .nav-hamburger:hover { color: var(--text-primary); border-color: var(--text-muted); }

    @media (max-width: 640px) {
      .site-nav-outer {
        padding: 12px 16px 0;
        -webkit-mask-image: none;
        mask-image: none;
      }
      .site-nav {
        flex-wrap: wrap;
        border-radius: 6px;
        padding: 10px 14px;
        gap: 4px;
        background: var(--bg-primary);
        border-color: var(--border);
      }
      .site-nav-brand { margin-right: auto; font-size: 0.72rem; }
      .site-nav-divider { display: none; }
      .nav-hamburger { display: inline-flex; align-items: center; }

      .site-nav-links-left,
      .site-nav-links-right {
        display: none;
        width: 100%;
        flex-direction: column;
        align-items: flex-start;
        gap: 0;
      }
      .site-nav-links-left {
        order: 3;
        border-top: 1px solid var(--border);
        padding-top: 8px;
        margin-top: 4px;
      }
      .site-nav-links-right { order: 4; margin-left: 0; }

      .site-nav.open .site-nav-links-left,
      .site-nav.open .site-nav-links-right {
        display: flex;
      }

      .site-nav-link { font-size: 0.82rem; padding: 8px 8px; }
      .site-nav-github { width: 34px; height: 34px; margin-left: 0; }
      .theme-toggle { margin-left: 0; margin-top: 4px; margin-bottom: 4px; }
    }

    /* ── Footer ─────────────────────────────── */
    .site-footer {
      position: relative;
      z-index: 10;
      padding: 40px 24px 40px;
    }
    .site-footer > * {
      max-width: 1000px;
      margin-left: auto;
      margin-right: auto;
    }

    .footer-top {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 48px;
      padding: 32px 0;
      border-top: 1px solid var(--border);
      border-bottom: 1px solid var(--border);
    }

    .footer-brand {
      flex-shrink: 0;
    }

    .footer-logo {
      font-size: 0.82rem;
      font-weight: 700;
      letter-spacing: 1.5px;
      text-transform: uppercase;
      color: var(--text-primary);
      text-decoration: none;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      transition: opacity 0.2s;
    }
    .footer-logo:hover { opacity: 0.7; }

    .footer-logo .brand-dot {
      width: 6px;
      height: 6px;
    }

    .footer-tagline {
      margin-top: 8px;
      font-size: 0.8rem;
      color: var(--text-muted);
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
      color: var(--text-secondary);
      margin-bottom: 4px;
    }

    .footer-col a {
      color: var(--text-muted);
      text-decoration: none;
      font-size: 0.82rem;
      transition: color 0.2s;
    }
    .footer-col a:hover { color: var(--text-primary); }

    .footer-bottom {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-top: 20px;
      font-size: 0.72rem;
      color: var(--text-muted);
      opacity: 0.7;
    }

    @media (max-width: 768px) {
      .footer-top { flex-direction: column; gap: 32px; }
      .footer-links { gap: 32px; }
    }

    @media (max-width: 480px) {
      .site-footer { padding: 40px 20px 32px; }
      .footer-links { gap: 20px; flex-direction: column; }
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
      background: transparent;
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 16px;
      text-align: center;
      transition: border-color 0.2s;
    }

    .deps-summary-card:hover { border-color: var(--text-muted); }

    .deps-summary-card-value {
      font-size: 1.5rem;
      font-weight: 700;
      line-height: 1;
      margin-bottom: 4px;
    }

    .deps-summary-card-label {
      font-size: 0.72rem;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    /* ── Shared: Deps Table ─────────────────── */
    .deps-section-card {
      background: transparent;
      border: 1px solid var(--border);
      border-radius: 6px;
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
      color: var(--text-secondary);
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
      color: var(--text-muted);
      padding: 8px 0;
      border-bottom: 1px solid var(--border);
    }

    .deps-table th:nth-child(2),
    .deps-table th:nth-child(4) { text-align: center; }

    .dep-row { transition: background 0.15s; }
    .dep-row:hover { background: var(--surface-hover); }
    .dep-row.clickable { cursor: pointer; }

    .dep-row td {
      padding: 12px 0;
      font-size: 0.85rem;
      vertical-align: middle;
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
      background: var(--surface-hover);
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

    .dep-arrow {
      color: var(--text-muted);
      font-size: 1rem;
      transition: color 0.2s;
    }

    .dep-row.clickable:hover .dep-arrow { color: var(--accent); }

    .unresolved-hint {
      color: var(--text-muted);
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
      border: 1px solid var(--border);
      color: var(--text-muted);
      padding: 4px 12px;
      border-radius: 8px;
      font-size: 0.72rem;
      font-family: 'Inter', sans-serif;
      cursor: pointer;
      transition: all 0.2s;
    }

    .sort-btn:hover { border-color: var(--text-muted); color: var(--text-secondary); }
    .sort-btn.active { border-color: var(--accent); color: var(--accent); }

    /* ── Shared: Dev Deps Toggle ────────────── */
    .dev-toggle {
      background: none;
      border: 1px solid var(--border);
      color: var(--text-secondary);
      padding: 8px 16px;
      border-radius: 4px;
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

    .dev-toggle:hover { border-color: var(--text-muted); }
    .dev-deps-content { display: none; margin-top: 12px; }
    .dev-deps-content.visible { display: block; }
    .dev-toggle .arrow { transition: transform 0.2s; display: inline-block; }
    .dev-toggle.expanded .arrow { transform: rotate(90deg); }

    /* ── Shared: Collapsible Groups ─────────── */
    .deps-group { margin-bottom: 8px; }

    .deps-group-toggle {
      background: none;
      border: none;
      color: var(--text-secondary);
      font-family: 'Inter', sans-serif;
      font-size: 0.9rem;
      font-weight: 600;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px 0;
      width: 100%;
      text-align: left;
      transition: color 0.2s;
    }
    .deps-group-toggle:hover { color: var(--text-primary); }
    .deps-group-toggle .arrow { transition: transform 0.2s; display: inline-block; font-size: 0.7rem; }
    .deps-group-toggle.expanded .arrow { transform: rotate(90deg); }
    .deps-group-content { display: none; }
    .deps-group-content.visible { display: block; }
    .deps-group-count {
      font-size: 0.75rem;
      font-weight: 400;
      color: var(--text-muted);
      margin-left: 4px;
    }

    /* ── Shared: Search Bar ─────────────────── */
    .deps-search {
      width: 100%;
      padding: 10px 16px;
      background: transparent;
      border: 1px solid var(--border);
      border-radius: 6px;
      color: var(--text-primary);
      font-family: 'Inter', sans-serif;
      font-size: 0.85rem;
      margin-bottom: 16px;
      transition: border-color 0.2s;
      outline: none;
    }
    .deps-search:focus { border-color: var(--accent); }
    .deps-search::placeholder { color: var(--text-muted); }

    /* ── Shared: Install CTA ───────────────── */
    .install-cta {
      background: transparent;
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 28px 32px;
      margin-bottom: 24px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 24px;
    }
    .install-cta-text h2 { font-size: 1.1rem; font-weight: 700; margin-bottom: 4px; }
    .install-cta-text p { color: var(--text-secondary); font-size: 0.85rem; line-height: 1.5; }
    .install-cta-sub { margin-top: 6px; font-size: 0.72rem; color: var(--text-muted); }
    .install-cta-btn {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background: var(--accent);
      color: var(--accent-text);
      text-decoration: none;
      padding: 10px 24px;
      border-radius: 6px;
      font-weight: 600;
      font-size: 0.85rem;
      transition: all 0.2s;
      white-space: nowrap;
      flex-shrink: 0;
    }
    .install-cta-btn:hover { background: var(--accent-hover); transform: translateY(-1px); }

    /* ── Shared: Summary Card active state ──── */
    .deps-summary-card { cursor: pointer; position: relative; }
    .deps-summary-card.active { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); }
    .deps-summary-card.active::after {
      content: '✕';
      position: absolute;
      top: 6px;
      right: 8px;
      font-size: 0.6rem;
      color: var(--text-muted);
    }

    /* ── Shared: Score History Chart ──────── */
    .history-chart {
      background: transparent;
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 24px 28px;
      margin-bottom: 28px;
    }
    .history-chart h2 {
      font-size: 1rem;
      font-weight: 600;
      margin-bottom: 16px;
      color: var(--text-secondary);
    }
    .history-chart svg {
      width: 100%;
      height: 80px;
      display: block;
    }
    .history-chart .chart-empty {
      font-size: 0.82rem;
      color: var(--text-muted);
      text-align: center;
      padding: 16px 0;
    }
    .history-dates {
      display: flex;
      justify-content: space-between;
      font-size: 0.7rem;
      color: var(--text-muted);
      margin-top: 8px;
    }

    /* ── Shared: CTA Section ────────────────── */
    .cta-section {
      background: transparent;
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 32px;
      text-align: center;
      margin-bottom: 24px;
    }

    .cta-section h2 { font-size: 1.2rem; font-weight: 700; margin-bottom: 8px; }

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
      color: var(--accent-text);
      text-decoration: none;
      padding: 12px 28px;
      border-radius: 6px;
      font-weight: 600;
      font-size: 0.9rem;
      transition: all 0.2s;
    }

    .cta-btn:hover { background: var(--accent-hover); transform: translateY(-1px); }

    .cta-sub {
      margin-top: 12px;
      font-size: 0.75rem;
      color: var(--text-muted);
    }

    /* ── Shared: Shimmer Animation ──────────── */
    @keyframes shimmer {
      0% { background-position: -200% 0; }
      100% { background-position: 200% 0; }
    }

    .deps-shimmer {
      background: linear-gradient(90deg, transparent 25%, var(--surface-hover) 50%, transparent 75%);
      background-size: 200% 100%;
      animation: shimmer 1.5s ease-in-out infinite;
      border-radius: 6px;
      padding: 24px;
      text-align: center;
      color: var(--text-muted);
      font-size: 0.85rem;
      min-height: 100px;
      display: flex;
      align-items: center;
      justify-content: center;
      border: 1px solid var(--border);
      margin-bottom: 24px;
    }

    /* ── Shared: Incomplete Notice ──────────── */
    .deps-incomplete-notice {
      background: rgba(234,179,8,0.08);
      border: 1px solid rgba(234,179,8,0.2);
      color: #fbbf24;
      padding: 12px 20px;
      border-radius: 6px;
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
      .install-cta { flex-direction: column; text-align: center; padding: 24px 20px; }
      .install-cta-btn { width: 100%; justify-content: center; }
      .history-chart { padding: 20px; }
    }
`;

/** GitHub SVG icon (16px Octicon) */
const githubSvg = `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>`;

/** Navbar HTML — clean minimal bar with theme toggle */
export const navbarHtml = `
  <div class="site-nav-outer">
    <nav class="site-nav" id="siteNav">
      <a href="/" class="site-nav-brand"><span class="brand-dot"></span>Is It Alive</a>
      <span class="site-nav-divider"></span>
      <button class="nav-hamburger" id="navHamburger" aria-label="Toggle menu">☰</button>
      <div class="site-nav-links-left">
        <a href="/trending" class="site-nav-link">Trending</a>
        <a href="/pricing" class="site-nav-link">Pricing</a>
        <a href="/methodology" class="site-nav-link">Methodology</a>
      </div>
      <div class="site-nav-links-right">
        <a href="/api" class="site-nav-link">API</a>
        <a href="/changelog" class="site-nav-link">Changelog</a>
        <a href="https://github.com/isitalive/isitalive" class="site-nav-github" aria-label="GitHub" target="_blank" rel="noopener">${githubSvg}</a>
        <button class="theme-toggle" id="themeToggle" aria-label="Toggle theme">
          <span class="theme-icon">◐</span>
          <span class="theme-label">System</span>
        </button>
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
          <a href="/pricing">Pricing</a>
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
      <span>&copy; Is It Alive</span>
      <span>Built with Cloudflare Workers &amp; Hono</span>
    </div>
  </footer>
`;
