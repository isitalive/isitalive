// ---------------------------------------------------------------------------
// Trending page — top repos by check volume (powered by WAE + Cron)
// ---------------------------------------------------------------------------

import type { TrendingRepo } from '../cron/handler';

function verdictColor(verdict: string): string {
  switch (verdict) {
    case 'healthy': return '#22c55e';
    case 'maintained': return '#eab308';
    case 'declining': return '#f97316';
    case 'at_risk': return '#ef4444';
    case 'archived': return '#6b7280';
    default: return '#6b7280';
  }
}

function verdictLabel(verdict: string): string {
  return verdict.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export function trendingPage(repos: TrendingRepo[], analyticsToken?: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Trending — Is It Alive?</title>
  <meta name="description" content="Most checked open-source projects in the last 24 hours. See what's trending on Is It Alive.">
  <style>
    :root {
      --bg: #0a0a0f;
      --surface: rgba(255,255,255,0.04);
      --border: rgba(255,255,255,0.08);
      --text-primary: #e4e4e7;
      --text-secondary: #a1a1aa;
      --text-muted: #52525b;
      --accent: #6366f1;
    }

    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      background: var(--bg);
      color: var(--text-primary);
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      min-height: 100vh;
      overflow-x: hidden;
    }

    .bg-orb {
      position: fixed;
      border-radius: 50%;
      pointer-events: none;
      z-index: 0;
    }
    .bg-orb.a { width: 600px; height: 600px; top: -200px; left: -100px; background: radial-gradient(circle, rgba(99,102,241,0.12) 0%, transparent 70%); }
    .bg-orb.b { width: 500px; height: 500px; bottom: -150px; right: -100px; background: radial-gradient(circle, rgba(168,85,247,0.10) 0%, transparent 70%); }

    .container {
      position: relative;
      z-index: 1;
      max-width: 720px;
      margin: 0 auto;
      padding: 48px 20px;
    }

    .back-link {
      display: inline-block;
      color: var(--text-muted);
      text-decoration: none;
      font-size: 0.8rem;
      margin-bottom: 24px;
      transition: color 0.2s;
    }
    .back-link:hover { color: var(--text-secondary); }

    h1 {
      font-size: 1.6rem;
      font-weight: 700;
      margin-bottom: 6px;
    }

    .subtitle {
      color: var(--text-muted);
      font-size: 0.82rem;
      margin-bottom: 32px;
    }

    .empty-state {
      text-align: center;
      padding: 64px 20px;
      color: var(--text-muted);
    }
    .empty-state p { font-size: 0.9rem; margin-top: 12px; }

    .repo-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .repo-card {
      display: flex;
      align-items: center;
      gap: 14px;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 14px 18px;
      text-decoration: none;
      color: var(--text-primary);
      transition: border-color 0.2s, background 0.2s;
    }
    .repo-card:hover {
      border-color: rgba(255,255,255,0.15);
      background: rgba(255,255,255,0.06);
    }

    .repo-rank {
      font-size: 0.72rem;
      font-weight: 600;
      color: var(--text-muted);
      min-width: 22px;
      text-align: center;
    }

    .repo-info {
      flex: 1;
      min-width: 0;
    }

    .repo-name {
      font-size: 0.88rem;
      font-weight: 600;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .repo-meta {
      font-size: 0.72rem;
      color: var(--text-muted);
      margin-top: 2px;
    }

    .repo-score {
      font-size: 1.1rem;
      font-weight: 700;
      min-width: 36px;
      text-align: right;
    }

    .repo-verdict {
      font-size: 0.65rem;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      padding: 3px 8px;
      border-radius: 99px;
      font-weight: 600;
      white-space: nowrap;
    }

    @media (max-width: 480px) {
      .repo-meta { display: none; }
      .repo-card { padding: 12px 14px; gap: 10px; }
    }
  </style>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
</head>
<body>
  <div class="bg-orb a"></div>
  <div class="bg-orb b"></div>

  <div class="container">
    <a href="/" class="back-link">← Back to Is It Alive?</a>
    <h1>🔥 Trending</h1>
    <p class="subtitle">Most checked projects in the last 24 hours</p>

    ${repos.length === 0 ? `
    <div class="empty-state">
      <div style="font-size:2.5rem">📊</div>
      <p>No trending data yet. Check back soon — the hourly aggregation needs a few data points first.</p>
    </div>
    ` : `
    <div class="repo-list">
      ${repos.map((r, i) => {
        const color = verdictColor(r.lastVerdict);
        return `
        <a href="/${r.repo}" class="repo-card" id="trending-${i + 1}">
          <span class="repo-rank">#${i + 1}</span>
          <div class="repo-info">
            <div class="repo-name">${r.repo}</div>
            <div class="repo-meta">${r.checks} check${r.checks !== 1 ? 's' : ''} today</div>
          </div>
          <span class="repo-verdict" style="background:${color}20;color:${color}">${verdictLabel(r.lastVerdict)}</span>
          <span class="repo-score" style="color:${color}">${r.avgScore}</span>
        </a>`;
      }).join('')}
    </div>
    `}
  </div>

  ${analyticsToken ? `<script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token":"${analyticsToken}"}'></script>` : ''}
</body>
</html>`;
}
