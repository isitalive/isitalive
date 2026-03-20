// ---------------------------------------------------------------------------
// Shared UI components
// ---------------------------------------------------------------------------

export const navbarHtml = `
  <nav style="display: flex; align-items: center; justify-content: space-between; padding: 24px 0; position: relative; z-index: 10;">
    <a href="/" style="font-size: 0.8rem; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; color: var(--accent); text-decoration: none;">Is It Alive</a>
    <div style="display: flex; gap: 20px;">
      <a href="/trending" style="color: var(--text-secondary); text-decoration: none; font-size: 0.85rem; font-weight: 500; transition: color 0.2s;">🔥 Trending</a>
      <a href="/methodology" style="color: var(--text-secondary); text-decoration: none; font-size: 0.85rem; font-weight: 500; transition: color 0.2s;">📖 Methodology</a>
      <a href="/changelog" style="color: var(--text-secondary); text-decoration: none; font-size: 0.85rem; font-weight: 500; transition: color 0.2s;">📋 Changelog</a>
    </div>
  </nav>
`;

export const footerHtml = `
  <footer style="text-align: center; padding: 80px 0 40px; color: var(--text-muted); font-size: 0.78rem; position: relative; z-index: 10;">
    <p>
      <a href="/" style="color: var(--text-secondary); text-decoration: none; transition: color 0.2s;">Home</a> &nbsp;·&nbsp;
      <a href="/trending" style="color: var(--text-secondary); text-decoration: none; transition: color 0.2s;">Trending</a> &nbsp;·&nbsp;
      <a href="/methodology" style="color: var(--text-secondary); text-decoration: none; transition: color 0.2s;">Methodology</a> &nbsp;·&nbsp;
      <a href="/changelog" style="color: var(--text-secondary); text-decoration: none; transition: color 0.2s;">Changelog</a> &nbsp;·&nbsp;
      <a href="https://github.com/isitalive/isitalive" style="color: var(--text-secondary); text-decoration: none; transition: color 0.2s;">GitHub</a>
    </p>
    <p style="margin-top: 12px; opacity: 0.5;">Built with Cloudflare Workers &amp; Hono</p>
  </footer>
`;
