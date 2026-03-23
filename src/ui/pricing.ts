// ---------------------------------------------------------------------------
// Pricing page — Free + Coming Soon teaser
// ---------------------------------------------------------------------------

import { navbarHtml, footerHtml, componentCss, themeCss, themeScript, themeHeadScript } from './components'
import { ogTags } from './og'
import { analyticsScript } from './analytics'

export function pricingPage(analyticsToken?: string): string {
  return `<!DOCTYPE html>
<html lang="en" data-theme="system">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
  <title>Pricing — Is It Alive?</title>
  <meta name="description" content="Is It Alive? is free for open source. Check dependency health, get badges, and automate audits in CI — no cost, no limits for public repos.">
  ${ogTags({
    title: 'Pricing — Is It Alive?',
    description: 'Free for open source, forever. Paid tiers coming soon for private repos.',
    url: 'https://isitalive.dev/pricing',
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
      max-width: 800px;
      margin: 0 auto;
      padding: 0 24px;
    }

    /* ── Hero ─────────────────────────────── */
    .pricing-hero {
      text-align: center;
      padding: 48px 0 40px;
    }

    .pricing-hero h1 {
      font-size: 2rem;
      font-weight: 800;
      letter-spacing: -0.03em;
      line-height: 1.1;
      margin-bottom: 12px;
    }

    .pricing-hero p {
      font-size: 1rem;
      color: var(--text-secondary);
      line-height: 1.6;
      max-width: 500px;
      margin: 0 auto;
    }

    /* ── Tier Cards ──────────────────────── */
    .tier-card {
      background: transparent;
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 36px;
      margin-bottom: 24px;
      transition: border-color 0.2s;
    }

    .tier-card:hover { border-color: var(--text-muted); }

    .tier-card.featured {
      border-color: var(--green);
      box-shadow: 0 0 0 1px var(--green), 0 4px 24px rgba(34,197,94,0.08);
    }

    .tier-header {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 20px;
    }

    .tier-emoji {
      font-size: 1.6rem;
    }

    .tier-name {
      font-size: 1.2rem;
      font-weight: 700;
    }

    .tier-subtitle {
      font-size: 0.85rem;
      color: var(--text-secondary);
      font-weight: 400;
    }

    .tier-features {
      list-style: none;
      margin-bottom: 24px;
    }

    .tier-features li {
      font-size: 0.9rem;
      color: var(--text-secondary);
      padding: 6px 0;
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .tier-features li::before {
      content: '✓';
      color: var(--green);
      font-weight: 700;
      flex-shrink: 0;
    }

    .tier-actions {
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
    }

    .tier-btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 10px 20px;
      border-radius: 6px;
      font-weight: 600;
      font-size: 0.85rem;
      text-decoration: none;
      transition: all 0.2s;
    }

    .tier-btn-primary {
      background: var(--accent);
      color: var(--accent-text);
    }
    .tier-btn-primary:hover { background: var(--accent-hover); transform: translateY(-1px); }

    .tier-btn-secondary {
      background: transparent;
      color: var(--text-secondary);
      border: 1px solid var(--border);
    }
    .tier-btn-secondary:hover { border-color: var(--text-muted); color: var(--text-primary); }

    /* ── Coming Soon Card ────────────────── */
    .coming-soon-card {
      background: transparent;
      border: 1px dashed var(--border);
      border-radius: 12px;
      padding: 36px;
      margin-bottom: 24px;
    }

    .coming-soon-header {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 16px;
    }

    .coming-soon-title {
      font-size: 1.1rem;
      font-weight: 700;
    }

    .coming-soon-badge {
      font-size: 0.7rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      background: var(--surface-hover);
      color: var(--text-muted);
      padding: 3px 10px;
      border-radius: 4px;
    }

    .coming-soon-features {
      color: var(--text-secondary);
      font-size: 0.9rem;
      line-height: 1.8;
      margin-bottom: 20px;
    }

    .notify-btn {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background: transparent;
      border: 1px solid var(--border);
      color: var(--text-secondary);
      padding: 10px 24px;
      border-radius: 6px;
      font-weight: 600;
      font-size: 0.85rem;
      text-decoration: none;
      transition: all 0.2s;
    }
    .notify-btn:hover { border-color: var(--accent); color: var(--text-primary); }

    /* ── Sponsors ─────────────────────────── */
    .sponsors-section {
      text-align: center;
      padding: 24px 0 48px;
      color: var(--text-muted);
      font-size: 0.9rem;
    }

    .sponsors-section a {
      color: var(--text-secondary);
      text-decoration: none;
      font-weight: 600;
      transition: color 0.2s;
    }
    .sponsors-section a:hover { color: var(--text-primary); }

    /* ── Responsive ──────────────────────── */
    @media (max-width: 640px) {
      .container { padding: 0 16px; }
      .pricing-hero { padding: 32px 0 28px; }
      .pricing-hero h1 { font-size: 1.6rem; }
      .tier-card, .coming-soon-card { padding: 24px; }
      .tier-actions { flex-direction: column; }
      .tier-btn { width: 100%; justify-content: center; }
    }
  </style>
</head>
<body>

  ${navbarHtml}

  <div class="container">

    <section class="pricing-hero">
      <h1>Know your dependencies are alive.</h1>
      <p>Free for open source, forever. We believe every developer deserves to know the health of their supply chain.</p>
    </section>

    <div class="tier-card featured">
      <div class="tier-header">
        <span class="tier-emoji">🆓</span>
        <div>
          <div class="tier-name">Free</div>
          <div class="tier-subtitle">Open source, forever.</div>
        </div>
      </div>
      <ul class="tier-features">
        <li>Single repo health checks</li>
        <li>Manifest audit for public repos</li>
        <li>GitHub Action — zero config, OIDC</li>
        <li>README badge for any repo</li>
        <li>REST API (5 req/min, unauthenticated)</li>
        <li>Score history & trend tracking</li>
      </ul>
      <div class="tier-actions">
        <a href="/" class="tier-btn tier-btn-primary">Check a Repo</a>
        <a href="https://github.com/isitalive/audit-action" class="tier-btn tier-btn-secondary" target="_blank" rel="noopener">Install Action</a>
      </div>
    </div>

    <div class="coming-soon-card">
      <div class="coming-soon-header">
        <span class="tier-emoji">💼</span>
        <span class="coming-soon-title">Paid Tiers</span>
        <span class="coming-soon-badge">Coming Soon</span>
      </div>
      <div class="coming-soon-features">
        Private repo monitoring · Manifest audits for private dependencies ·
        Faster cache freshness · Higher API rate limits ·
        Priority scoring · Team dashboards
      </div>
      <a href="mailto:hello@isitalive.dev?subject=Interested%20in%20paid%20tiers" class="notify-btn">
        📬 Notify me when available
      </a>
    </div>

    <div class="sponsors-section">
      <p>💛 Love this project?</p>
      <a href="https://github.com/sponsors/isitalive" target="_blank" rel="noopener">
        Support via GitHub Sponsors →
      </a>
    </div>

  </div>

  ${footerHtml}

  ${themeScript}
  ${analyticsScript(analyticsToken)}
</body>
</html>`
}
