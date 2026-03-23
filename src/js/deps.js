// ---------------------------------------------------------------------------
// Dependency Health Hydration — client-side script for result pages
//
// Fetches dependency health data from /_data/deps/github/:owner/:repo
// and renders summary cards, sortable table, and CI CTA.
//
// Reads owner/repo from data attributes on the #depsContainer element:
//   <div id="depsContainer" data-owner="vercel" data-repo="next.js">
// ---------------------------------------------------------------------------

(function () {
  var VERDICT_COLORS = {
    healthy: '#22c55e', stable: '#eab308', degraded: '#f97316',
    critical: '#ef4444', unmaintained: '#6b7280', pending: '#8b8b9e',
    unresolved: '#55556a'
  };
  var VERDICT_EMOJI = {
    healthy: '✅', stable: '🟡', degraded: '⚠️', critical: '🔴',
    unmaintained: '⚫', pending: '⏳', unresolved: '❓'
  };

  function scoreColor(s) {
    if (s >= 80) return '#22c55e';
    if (s >= 60) return '#eab308';
    if (s >= 40) return '#f97316';
    if (s >= 20) return '#ef4444';
    return '#6b7280';
  }

  function esc(s) {
    var d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  function renderDeps(data) {
    var container = document.getElementById('depsContainer');
    if (!container) return;

    // No manifests found — hide entirely
    if (!data.manifests || data.manifests.length === 0) {
      container.style.display = 'none';
      return;
    }

    // No deps parsed (empty manifest)
    if (!data.dependencies || data.dependencies.length === 0) {
      container.innerHTML = '';
      return;
    }

    var prodDeps = data.dependencies.filter(function (d) { return !d.dev; });
    var devDeps = data.dependencies.filter(function (d) { return d.dev; });
    var s = data.summary || {};

    var html = '';

    // Summary cards
    html += '<div class="deps-summary-cards">';
    html += '<div class="deps-summary-card"><div class="deps-summary-card-value" style="color:#22c55e">' + (s.healthy || 0) + '</div><div class="deps-summary-card-label">✅ Healthy</div></div>';
    html += '<div class="deps-summary-card"><div class="deps-summary-card-value" style="color:#eab308">' + (s.stable || 0) + '</div><div class="deps-summary-card-label">🟡 Stable</div></div>';
    html += '<div class="deps-summary-card"><div class="deps-summary-card-value" style="color:#f97316">' + (s.degraded || 0) + '</div><div class="deps-summary-card-label">⚠️ Degraded</div></div>';
    html += '<div class="deps-summary-card"><div class="deps-summary-card-value" style="color:#ef4444">' + ((s.critical || 0) + (s.unmaintained || 0)) + '</div><div class="deps-summary-card-label">🔴 At Risk</div></div>';
    html += '</div>';

    // Incomplete notice
    if (!data.complete && data.pending > 0) {
      html += '<div class="deps-incomplete-notice">⏳ ' + data.pending + ' dependencies are still being scored. Auto-refreshing…</div>';
    }

    // Deps table
    html += '<section class="deps-section-card">';
    html += '<div class="deps-section-header"><h2>Dependencies (' + prodDeps.length + ')</h2>';
    html += '<div class="deps-sort">';
    html += '<button class="sort-btn active" data-sort="score-asc" id="rSortScoreAsc">Score ↑</button>';
    html += '<button class="sort-btn" data-sort="score-desc" id="rSortScoreDesc">Score ↓</button>';
    html += '<button class="sort-btn" data-sort="name" id="rSortName">A–Z</button>';
    html += '</div></div>';
    html += '<table class="deps-table"><thead><tr><th>Dependency</th><th>Score</th><th>Verdict</th><th></th></tr></thead>';
    html += '<tbody id="resultProdBody">';
    html += prodDeps.map(renderRow).join('');
    html += '</tbody></table>';

    // Dev deps toggle
    if (devDeps.length > 0) {
      html += '<button class="dev-toggle" id="resultDevToggle"><span class="arrow">▶</span> Dev Dependencies (' + devDeps.length + ')</button>';
      html += '<div class="dev-deps-content" id="resultDevContent">';
      html += '<table class="deps-table"><thead><tr><th>Dependency</th><th>Score</th><th>Verdict</th><th></th></tr></thead>';
      html += '<tbody id="resultDevBody">' + devDeps.map(renderRow).join('') + '</tbody></table>';
      html += '</div>';
    }

    html += '</section>';

    // CTA
    html += '<section class="cta-section">';
    html += '<h2>🚀 Automate this in CI</h2>';
    html += '<p>Add dependency health checks to every pull request with the IsItAlive GitHub Action. Zero config for public repos.</p>';
    html += '<a href="https://github.com/isitalive/audit-action" class="cta-btn" target="_blank" rel="noopener">Get Started →</a>';
    html += '<div class="cta-sub">Free for public repos · No API key needed · Powered by OIDC</div>';
    html += '</section>';

    container.innerHTML = html;

    // Bind sort buttons
    container.querySelectorAll('.sort-btn[data-sort]').forEach(function (btn) {
      btn.addEventListener('click', function () { sortDeps(btn.getAttribute('data-sort')); });
    });

    // Bind dev deps toggle
    var devToggle = document.getElementById('resultDevToggle');
    if (devToggle) {
      devToggle.addEventListener('click', function () {
        var content = document.getElementById('resultDevContent');
        if (!content) return;
        var visible = content.classList.toggle('visible');
        devToggle.classList.toggle('expanded', visible);
      });
    }

    // Auto-retry if incomplete
    if (!data.complete && data.pending > 0) {
      setTimeout(function () { loadDeps(); }, 5000);
    }
  }

  function renderRow(dep) {
    var name = esc(dep.name);
    var version = esc(dep.version);
    var emoji = VERDICT_EMOJI[dep.verdict] || '❓';
    var color = VERDICT_COLORS[dep.verdict] || '#6b7280';
    var scoreText = dep.score !== null ? String(dep.score) : '—';
    var scoreStyle = dep.score !== null ? 'color:' + scoreColor(dep.score) : 'color:var(--text-muted)';
    var verdictLabel = dep.verdict.charAt(0).toUpperCase() + dep.verdict.slice(1);
    var devBadge = dep.dev ? '<span class="dev-badge">dev</span>' : '';
    var link = dep.github ? '<a href="/github/' + esc(dep.github) + '" class="dep-link" title="View health details">→</a>' : '';
    var hint = dep.unresolvedReason ? '<span class="unresolved-hint" title="' + esc(dep.unresolvedReason) + '">ⓘ</span>' : '';

    return '<tr class="dep-row" data-score="' + (dep.score != null ? dep.score : -1) + '" data-verdict="' + dep.verdict + '">'
      + '<td class="dep-name"><span class="dep-name-text">' + name + '</span>' + devBadge + '<span class="dep-version">' + version + '</span></td>'
      + '<td class="dep-score" style="' + scoreStyle + '">' + scoreText + '</td>'
      + '<td class="dep-verdict"><span class="verdict-dot" style="background:' + color + '"></span><span style="color:' + color + '">' + emoji + ' ' + verdictLabel + '</span>' + hint + '</td>'
      + '<td class="dep-action">' + link + '</td>'
      + '</tr>';
  }

  function loadDeps() {
    var container = document.getElementById('depsContainer');
    if (!container) return;

    var owner = container.getAttribute('data-owner');
    var repo = container.getAttribute('data-repo');
    if (!owner || !repo) return;

    fetch('/_data/deps/github/' + encodeURIComponent(owner) + '/' + encodeURIComponent(repo))
      .then(function (r) { return r.json(); })
      .then(renderDeps)
      .catch(function () {
        // Non-critical — hide the shimmer silently
        var shimmer = document.getElementById('depsShimmer');
        if (shimmer) shimmer.style.display = 'none';
      });
  }

  function sortDeps(mode) {
    var tbody = document.getElementById('resultProdBody');
    if (!tbody) return;
    var rows = Array.from(tbody.querySelectorAll('.dep-row'));
    rows.sort(function (a, b) {
      var sa = parseInt(a.dataset.score, 10);
      var sb = parseInt(b.dataset.score, 10);
      if (mode === 'score-asc') return sa - sb;
      if (mode === 'score-desc') return sb - sa;
      return a.querySelector('.dep-name-text').textContent
        .localeCompare(b.querySelector('.dep-name-text').textContent);
    });
    rows.forEach(function (r) { tbody.appendChild(r); });
    document.querySelectorAll('.deps-sort .sort-btn').forEach(function (b) { b.classList.remove('active'); });
    if (mode === 'score-asc') document.getElementById('rSortScoreAsc').classList.add('active');
    if (mode === 'score-desc') document.getElementById('rSortScoreDesc').classList.add('active');
    if (mode === 'name') document.getElementById('rSortName').classList.add('active');
  }

  // Start loading
  loadDeps();
})();
