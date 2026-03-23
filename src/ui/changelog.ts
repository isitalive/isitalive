// ---------------------------------------------------------------------------
// Changelog page — static HTML shell with client-side infinite scroll
//
// The HTML shell is edge-cached. Changelog data is hydrated client-side
// via fetch('/_data/changelog?page=1&limit=5') with infinite scroll loading.
// ---------------------------------------------------------------------------

import { navbarHtml, footerHtml, componentCss, themeCss, themeScript, themeHeadScript } from './components';
import { ogTags } from './og';
import { analyticsScript } from './analytics';

export function changelogPage(analyticsToken?: string): string {
  return `<!DOCTYPE html>
<html lang="en" data-theme="system">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
  <title>Changelog — Is It Alive?</title>
  <meta name="description" content="What's new in Is It Alive? See the latest features, fixes, and improvements.">
  ${ogTags({
    title: 'Changelog — Is It Alive?',
    description: "What's new in Is It Alive? See the latest features, fixes, and improvements.",
    url: 'https://isitalive.dev/changelog',
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
      line-height: 1.6;
      transition: background 0.3s, color 0.3s;
    }

    .container {
      position: relative;
      z-index: 1;
      max-width: 900px;
      margin: 0 auto;
      padding: 40px 24px 0;
    }

    h1 {
      font-size: 2rem;
      font-weight: 800;
      margin: 0 0 12px;
      letter-spacing: -0.02em;
    }

    .intro {
      color: var(--text-secondary);
      font-size: 0.95rem;
      margin-bottom: 40px;
      max-width: 100%;
    }

    /* ── Version cards ── */
    .version-card {
      position: relative;
      background: transparent;
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 28px;
      margin-bottom: 24px;
      transition: border-color 0.3s;
    }
    .version-card:hover { border-color: var(--text-muted); }

    .version-header {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 20px;
    }

    .version-tag {
      background: var(--accent);
      color: var(--accent-text);
      padding: 4px 14px;
      border-radius: 4px;
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
    .version-card + .version-card::before {
      content: '';
      position: absolute;
      left: 46px;
      top: -24px;
      width: 2px;
      height: 24px;
      background: var(--border);
    }

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

    /* ── Loading skeleton ── */
    .skeleton-card {
      background: transparent;
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 28px;
      margin-bottom: 24px;
      animation: pulse 1.5s ease-in-out infinite;
    }
    .skeleton-bar {
      height: 12px;
      background: var(--surface-hover);
      border-radius: 6px;
      margin-bottom: 10px;
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }

    /* ── Load more ── */
    .load-more {
      text-align: center;
      padding: 20px 0;
      color: var(--text-muted);
      font-size: 0.82rem;
    }
    .load-more-btn {
      background: transparent;
      border: 1px solid var(--border);
      border-radius: 6px;
      color: var(--text-secondary);
      padding: 10px 28px;
      font-family: inherit;
      font-size: 0.85rem;
      cursor: pointer;
      transition: border-color 0.2s, color 0.2s;
    }
    .load-more-btn:hover {
      border-color: var(--accent);
      color: var(--text-primary);
    }

    @media (max-width: 640px) {
      h1 { font-size: 1.5rem; }
      .version-card { padding: 20px; }
    }
  </style>
</head>
<body>

  ${navbarHtml}

  <div class="container">
    <h1>Changelog</h1>
    <p class="intro">What's new, improved, and fixed in Is It Alive?</p>

    <div id="changelogList">
      ${Array.from({ length: 2 }, () => `
      <div class="skeleton-card">
        <div style="display:flex;gap:12px;margin-bottom:16px">
          <div class="skeleton-bar" style="width:70px;height:24px;margin:0"></div>
          <div class="skeleton-bar" style="width:100px;height:14px;margin:auto 0"></div>
        </div>
        <div class="skeleton-bar" style="width:40%"></div>
        <div class="skeleton-bar" style="width:80%"></div>
        <div class="skeleton-bar" style="width:65%"></div>
        <div class="skeleton-bar" style="width:50%"></div>
      </div>`).join('')}
    </div>

    <div id="loadMore" style="display:none" class="load-more">
      <button class="load-more-btn" id="loadMoreBtn">Load more</button>
    </div>

    <div id="endMsg" style="display:none" class="load-more">That's everything so far.</div>

  </div>

  ${footerHtml}

  <script>
    var TYPE_CONFIG = {
      added:   { label: 'Added',   color: '#22c55e', bg: 'rgba(34,197,94,0.12)' },
      changed: { label: 'Changed', color: '#eab308', bg: 'rgba(234,179,8,0.12)' },
      fixed:   { label: 'Fixed',   color: '#6366f1', bg: 'rgba(99,102,241,0.12)' },
      removed: { label: 'Removed', color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
    };

    function groupEntries(entries) {
      var groups = {};
      entries.forEach(function(e) {
        if (!groups[e.type]) groups[e.type] = [];
        groups[e.type].push(e);
      });
      return groups;
    }

    function renderVersion(v) {
      var grouped = groupEntries(v.entries);
      var groupsHtml = '';
      for (var type in grouped) {
        var cfg = TYPE_CONFIG[type] || TYPE_CONFIG.added;
        var items = grouped[type].map(function(e) { return '<li>' + e.text + '</li>'; }).join('');
        groupsHtml += '<div class="change-group">'
          + '<span class="change-badge" style="color:' + cfg.color + ';background:' + cfg.bg + '">' + cfg.label + '</span>'
          + '<ul>' + items + '</ul>'
          + '</div>';
      }
      return '<div class="version-card">'
        + '<div class="version-header">'
        + '<span class="version-tag">v' + v.version + '</span>'
        + '<span class="version-date">' + v.date + '</span>'
        + '</div>'
        + groupsHtml
        + '</div>';
    }

    var page = 1;
    var PAGE_SIZE = 5;
    var loading = false;
    var allLoaded = false;
    var listEl = document.getElementById('changelogList');
    var loadMoreEl = document.getElementById('loadMore');
    var loadMoreBtn = document.getElementById('loadMoreBtn');
    var endMsgEl = document.getElementById('endMsg');

    function loadPage() {
      if (loading || allLoaded) return;
      loading = true;
      loadMoreBtn.textContent = 'Loading…';

      fetch('/_data/changelog?page=' + page + '&limit=' + PAGE_SIZE)
        .then(function(r) { return r.json(); })
        .then(function(data) {
          // First load — clear skeletons
          if (page === 1) listEl.innerHTML = '';

          if (!data.versions || data.versions.length === 0) {
            allLoaded = true;
            loadMoreEl.style.display = 'none';
            endMsgEl.style.display = '';
            return;
          }

          listEl.innerHTML += data.versions.map(renderVersion).join('');
          page++;
          loadMoreBtn.textContent = 'Load more';

          if (!data.hasMore) {
            allLoaded = true;
            loadMoreEl.style.display = 'none';
            endMsgEl.style.display = '';
          } else {
            loadMoreEl.style.display = '';
          }
        })
        .catch(function() {
          loadMoreBtn.textContent = 'Failed — tap to retry';
        })
        .finally(function() {
          loading = false;
        });
    }

    loadMoreBtn.addEventListener('click', loadPage);

    // Infinite scroll — load when near bottom
    var scrollTimer;
    window.addEventListener('scroll', function() {
      clearTimeout(scrollTimer);
      scrollTimer = setTimeout(function() {
        if (allLoaded || loading) return;
        var scrollBottom = window.innerHeight + window.scrollY;
        if (scrollBottom >= document.body.offsetHeight - 300) {
          loadPage();
        }
      }, 100);
    });

    // Initial load
    loadPage();
  </script>
  ${themeScript}
  ${analyticsScript(analyticsToken)}
</body>
</html>`;
}
