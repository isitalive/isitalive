// ---------------------------------------------------------------------------
// Trending page — HTML shell with client-side hydration
//
// The HTML shell (layout, CSS, nav) is edge-cached for a long time.
// Fresh trending data is fetched client-side from /api/trending.
// ---------------------------------------------------------------------------

import { navbarHtml, footerHtml, componentCss } from './components';
import { ogTags } from './og';

export function trendingPage(analyticsToken?: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Trending — Is It Alive?</title>
  <meta name="description" content="Most checked open-source projects in the last 24 hours. See what's trending on Is It Alive.">
  ${ogTags({
    title: 'Trending — Is It Alive?',
    description: 'Most checked open-source projects in the last 24 hours. See what\'s trending on Is It Alive.',
    url: 'https://isitalive.dev/trending',
  })}
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

    ${componentCss}

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
      max-width: 900px;
      margin: 0 auto;
      padding: 0 24px 48px;
    }

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

    /* Loading skeleton */
    .skeleton-card {
      display: flex;
      align-items: center;
      gap: 14px;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 14px 18px;
      animation: pulse 1.5s ease-in-out infinite;
    }
    .skeleton-bar {
      height: 12px;
      background: rgba(255,255,255,0.06);
      border-radius: 6px;
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }

    .load-more-container {
      text-align: center;
      margin-top: 16px;
    }
    .btn-load-more {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 10px 24px;
      border-radius: 10px;
      background: var(--surface);
      border: 1px solid var(--border);
      color: var(--text-secondary);
      font-family: 'Inter', sans-serif;
      font-size: 0.82rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
    }
    .btn-load-more:hover { background: rgba(255,255,255,0.08); color: var(--text-primary); }
    .btn-load-more:disabled { opacity: 0.5; cursor: not-allowed; }
    .total-count { color: var(--text-muted); font-size: 0.75rem; margin-top: 8px; }

    @media (max-width: 640px) {
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

  ${navbarHtml}

  <div class="container">    <h1>🔥 Trending</h1>
    <p class="subtitle">Most checked projects in the last 24 hours</p>

    <div id="trending-list" class="repo-list">
      ${Array.from({ length: 5 }, () => `
      <div class="skeleton-card">
        <div class="skeleton-bar" style="width:22px;height:14px"></div>
        <div style="flex:1;display:flex;flex-direction:column;gap:6px">
          <div class="skeleton-bar" style="width:60%"></div>
          <div class="skeleton-bar" style="width:30%;height:8px"></div>
        </div>
        <div class="skeleton-bar" style="width:50px;height:20px"></div>
        <div class="skeleton-bar" style="width:30px;height:20px"></div>
      </div>`).join('')}
    </div>
    <div id="load-more" class="load-more-container" style="display:none">
      <button class="btn-load-more" id="btn-load-more" onclick="loadMore()">Load more</button>
      <div class="total-count" id="total-count"></div>
    </div>

  </div>

  ${footerHtml}

  <script>
    const VERDICT_COLORS = {
      healthy: '#22c55e',
      stable: '#eab308',
      degraded: '#f97316',
      critical: '#ef4444',
      unmaintained: '#6b7280',
    };

    var currentOffset = 0;
    var pageSize = 20;
    var totalRepos = 0;

    function verdictLabel(v) {
      return v.replace(/_/g, ' ').replace(/\\b\\w/g, c => c.toUpperCase());
    }

    function normalizeVerdict(v) {
      var REMAP = { declining:'degraded', inactive:'degraded', stale:'degraded', at_risk:'critical', dormant:'critical', abandoned:'unmaintained', maintained:'stable' };
      return REMAP[v] || v;
    }

    function renderCard(r, i) {
      var verdict = normalizeVerdict(r.lastVerdict);
      const color = VERDICT_COLORS[verdict] || '#6b7280';
      return '<a href="/github/' + r.repo + '" class="repo-card" id="trending-' + (i+1) + '">'
        + '<span class="repo-rank">#' + (i+1) + '</span>'
        + '<div class="repo-info">'
        + '<div class="repo-name">' + r.repo + '</div>'
        + '<div class="repo-meta">' + r.checks + ' check' + (r.checks !== 1 ? 's' : '') + ' today</div>'
        + '</div>'
        + '<span class="repo-verdict" style="background:' + color + '20;color:' + color + '">' + verdictLabel(verdict) + '</span>'
        + '<span class="repo-score" style="color:' + color + '">' + r.avgScore + '</span>'
        + '</a>';
    }

    function loadMore() {
      var btn = document.getElementById('btn-load-more');
      btn.disabled = true;
      btn.textContent = 'Loading...';
      fetch('/api/trending?limit=' + pageSize + '&offset=' + currentOffset)
        .then(r => r.json())
        .then(data => {
          var el = document.getElementById('trending-list');
          var html = data.repos.map(function(r, i) { return renderCard(r, currentOffset + i); }).join('');
          el.insertAdjacentHTML('beforeend', html);
          currentOffset += data.repos.length;
          totalRepos = data.total;
          document.getElementById('total-count').textContent = currentOffset + ' of ' + totalRepos + ' repos';
          if (data.hasMore) {
            btn.disabled = false;
            btn.textContent = 'Load more';
          } else {
            document.getElementById('load-more').style.display = 'none';
          }
        });
    }

    // Initial load
    fetch('/api/trending?limit=' + pageSize + '&offset=0')
      .then(r => r.json())
      .then(data => {
        const el = document.getElementById('trending-list');
        if (!data.repos || data.repos.length === 0) {
          el.innerHTML = '<div class="empty-state"><div style="font-size:2.5rem">📊</div><p>No trending data yet. Check back soon.</p></div>';
        } else {
          el.innerHTML = data.repos.map(renderCard).join('');
          currentOffset = data.repos.length;
          totalRepos = data.total;
          document.getElementById('total-count').textContent = currentOffset + ' of ' + totalRepos + ' repos';
          if (data.hasMore) {
            document.getElementById('load-more').style.display = 'block';
          }
        }
      })
      .catch(() => {
        document.getElementById('trending-list').innerHTML =
          '<div class="empty-state"><div style="font-size:2.5rem">⚠️</div><p>Failed to load trending data.</p></div>';
      });
  </script>
  ${analyticsToken ? `<script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token":"${analyticsToken}"}'></script>` : ''}
</body>
</html>`;
}
