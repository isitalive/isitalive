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

    @media (max-width: 480px) {
      .site-nav { flex-direction: column; gap: 12px; }
      .site-nav-links { gap: 14px; }
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
`;

/** Navbar HTML — uses .site-nav classes defined in componentCss */
export const navbarHtml = `
  <nav class="site-nav">
    <a href="/" class="site-nav-brand">Is It Alive</a>
    <div class="site-nav-links">
      <a href="/trending" class="site-nav-link">🔥 Trending</a>
      <a href="/methodology" class="site-nav-link">📖 Methodology</a>
      <a href="/changelog" class="site-nav-link">📋 Changelog</a>
    </div>
  </nav>
`;

/** Footer HTML — uses .site-footer classes defined in componentCss */
export const footerHtml = `
  <footer class="site-footer">
    <p>
      <a href="/">Home</a> &nbsp;·&nbsp;
      <a href="/trending">Trending</a> &nbsp;·&nbsp;
      <a href="/methodology">Methodology</a> &nbsp;·&nbsp;
      <a href="/changelog">Changelog</a> &nbsp;·&nbsp;
      <a href="https://github.com/isitalive/isitalive">GitHub</a>
    </p>
    <p class="site-footer-credits">Built with Cloudflare Workers &amp; Hono</p>
  </footer>
`;
