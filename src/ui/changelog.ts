// ---------------------------------------------------------------------------
// Changelog page — rendered from structured data
// ---------------------------------------------------------------------------

import { navbarHtml, footerHtml } from './components';

interface ChangeEntry {
  type: 'added' | 'changed' | 'fixed' | 'removed';
  text: string;
}

interface Version {
  version: string;
  date: string;
  entries: ChangeEntry[];
}

const typeConfig = {
  added:   { label: 'Added',   color: '#22c55e', bg: 'rgba(34,197,94,0.12)' },
  changed: { label: 'Changed', color: '#eab308', bg: 'rgba(234,179,8,0.12)' },
  fixed:   { label: 'Fixed',   color: '#6366f1', bg: 'rgba(99,102,241,0.12)' },
  removed: { label: 'Removed', color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
};

// ---- Changelog data — add new versions at the top ----
const changelog: Version[] = [
  {
    version: '0.3.0',
    date: '2026-03-20',
    entries: [
      { type: 'added', text: 'Loading transition with spinner, progress bar, and page fade' },
      { type: 'added', text: 'This changelog page' },
      { type: 'fixed', text: 'Loading state persisting when navigating back via browser history' },
      { type: 'fixed', text: 'GitHub org typo in footer link' },
    ],
  },
  {
    version: '0.2.0',
    date: '2026-03-20',
    entries: [
      { type: 'added', text: 'Scoring engine with 8 weighted signals' },
      { type: 'added', text: 'Stability override for finished / complete projects' },
      { type: 'added', text: 'Solo-maintainer forgiveness for small repos' },
      { type: 'added', text: 'Inbox-zero recognition for clean repos' },
      { type: 'changed', text: 'CI/CD weight increased from 5% to 10% (fixes weight sum bug)' },
      { type: 'changed', text: 'Rate limits switched from per-hour to per-minute' },
      { type: 'fixed', text: 'Clean repos being penalized for having zero open issues' },
    ],
  },
  {
    version: '0.1.0',
    date: '2026-03-19',
    entries: [
      { type: 'added', text: 'Landing page with search and recent queries' },
      { type: 'added', text: 'Health check result pages with score breakdown' },
      { type: 'added', text: 'Trending page powered by R2 SQL + hourly cron' },
      { type: 'added', text: 'Methodology page explaining all 8 signals' },
      { type: 'added', text: 'REST API with tiered API key access' },
      { type: 'added', text: 'Cloudflare Turnstile bot protection' },
      { type: 'added', text: 'KV caching with stale-while-revalidate' },
      { type: 'added', text: 'Analytics pipeline (Iceberg / R2)' },
      { type: 'added', text: 'Dynamic sitemap generation' },
    ],
  },
];

function renderEntries(entries: ChangeEntry[]): string {
  const grouped = new Map<string, ChangeEntry[]>();
  for (const e of entries) {
    const list = grouped.get(e.type) || [];
    list.push(e);
    grouped.set(e.type, list);
  }

  let html = '';
  for (const [type, items] of grouped) {
    const cfg = typeConfig[type as keyof typeof typeConfig];
    html += `
      <div class="change-group">
        <span class="change-badge" style="color: ${cfg.color}; background: ${cfg.bg}">${cfg.label}</span>
        <ul>
          ${items.map(i => `<li>${i.text}</li>`).join('\n          ')}
        </ul>
      </div>`;
  }
  return html;
}

export function changelogPage(analyticsToken?: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Changelog — Is It Alive?</title>
  <meta name="description" content="What's new in Is It Alive? See the latest features, fixes, and improvements.">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="preload" as="style" href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap">
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" media="print" onload="this.media='all'">
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
      line-height: 1.6;
    }

    .bg-orb {
      position: fixed;
      border-radius: 50%;
      pointer-events: none;
      z-index: 0;
    }
    .bg-orb-1 { width: 500px; height: 500px; background: radial-gradient(circle, rgba(99,102,241,0.08) 0%, transparent 70%); top: -150px; right: -100px; }
    .bg-orb-2 { width: 400px; height: 400px; background: radial-gradient(circle, rgba(34,197,94,0.08) 0%, transparent 70%); bottom: -150px; left: -100px; }

    .container {
      position: relative;
      z-index: 1;
      max-width: 740px;
      margin: 0 auto;
      padding: 0 24px;
    }

    h1 {
      font-size: 2rem;
      font-weight: 800;
      margin: 32px 0 12px;
      letter-spacing: -0.02em;
    }

    .intro {
      color: var(--text-secondary);
      font-size: 0.95rem;
      margin-bottom: 40px;
      max-width: 600px;
    }

    /* ── Version cards ── */
    .version-card {
      position: relative;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 28px;
      margin-bottom: 24px;
      transition: border-color 0.3s;
    }
    .version-card:hover { border-color: rgba(255,255,255,0.15); }

    .version-header {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 20px;
    }

    .version-tag {
      background: var(--accent);
      color: #fff;
      padding: 4px 14px;
      border-radius: 99px;
      font-size: 0.82rem;
      font-weight: 700;
      letter-spacing: 0.5px;
    }

    .version-date {
      color: var(--text-muted);
      font-size: 0.82rem;
      font-weight: 500;
    }

    /* ── Timeline line ── */
    .version-card::before {
      content: '';
      position: absolute;
      left: 46px;
      top: -24px;
      width: 2px;
      height: 24px;
      background: var(--border);
    }
    .version-card:first-child::before { display: none; }

    /* ── Change groups ── */
    .change-group {
      margin-bottom: 16px;
    }
    .change-group:last-child { margin-bottom: 0; }

    .change-badge {
      display: inline-block;
      padding: 2px 10px;
      border-radius: 6px;
      font-size: 0.72rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 8px;
    }

    .change-group ul {
      list-style: none;
      padding: 0;
    }

    .change-group li {
      position: relative;
      padding-left: 18px;
      font-size: 0.88rem;
      color: var(--text-secondary);
      margin-bottom: 6px;
      line-height: 1.5;
    }

    .change-group li::before {
      content: '›';
      position: absolute;
      left: 0;
      color: var(--text-muted);
      font-weight: 700;
      font-size: 1rem;
    }

    footer {
      text-align: center;
      padding: 60px 0 40px;
      color: var(--text-muted);
      font-size: 0.75rem;
    }
    footer a { color: var(--accent); text-decoration: none; }

    @media (max-width: 640px) {
      h1 { font-size: 1.5rem; }
      .version-card { padding: 20px; }
    }
  </style>
</head>
<body>
  <div class="bg-orb bg-orb-1"></div>
  <div class="bg-orb bg-orb-2"></div>

  <div class="container">
    ${navbarHtml}

    <h1>Changelog</h1>
    <p class="intro">What's new, improved, and fixed in Is It Alive?</p>

    ${changelog.map(v => `
    <div class="version-card">
      <div class="version-header">
        <span class="version-tag">v${v.version}</span>
        <span class="version-date">${v.date}</span>
      </div>
      ${renderEntries(v.entries)}
    </div>`).join('\n')}

    ${footerHtml}
  </div>
  ${analyticsToken ? '<script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon=\'{"token":"' + analyticsToken + '"}\'></script>' : ''}
</body>
</html>`;
}
