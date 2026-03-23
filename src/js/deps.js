// ---------------------------------------------------------------------------
// Dependency Health Hydration — client-side script for result pages
//
// Fetches dependency health data from /_data/deps/github/:owner/:repo
// and renders summary cards, collapsible dep groups, search, and CTA.
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

  function renderGroup(id, icon, label, deps, expanded) {
    if (deps.length === 0) return '';
    var html = '<div class="deps-group" id="group' + id + '">';
    html += '<button class="deps-group-toggle' + (expanded ? ' expanded' : '') + '" data-target="' + id + 'Content" aria-expanded="' + (expanded ? 'true' : 'false') + '">';
    html += '<span class="arrow">▶</span> ' + icon + ' ' + label + '<span class="deps-group-count">(' + deps.length + ')</span>';
    html += '</button>';
    html += '<div class="deps-group-content' + (expanded ? ' visible' : '') + '" id="' + id + 'Content">';
    html += '<table class="deps-table"><thead><tr><th>Dependency</th><th>Score</th><th>Verdict</th><th></th></tr></thead>';
    html += '<tbody>' + deps.map(renderRow).join('') + '</tbody></table>';
    html += '</div></div>';
    return html;
  }

  function buildInstallUrl(owner, repo) {
    var yaml = 'name: Dependency Health Audit\non:\n  pull_request:\n    paths: [\'package.json\', \'go.mod\']\npermissions:\n  contents: read\n  pull-requests: write\n  id-token: write\njobs:\n  audit:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - uses: isitalive/audit-action@v1\n';
    return 'https://github.com/' + encodeURIComponent(owner) + '/' + encodeURIComponent(repo) + '/new/main?filename=.github/workflows/isitalive.yml&value=' + encodeURIComponent(yaml);
  }

  function renderDeps(data) {
    var container = document.getElementById('depsContainer');
    if (!container) return;

    var owner = container.getAttribute('data-owner');
    var repo = container.getAttribute('data-repo');

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

    // Split prod deps into groups
    var needsAttention = prodDeps.filter(function (d) {
      return d.verdict === 'degraded' || d.verdict === 'critical' || d.verdict === 'unmaintained';
    });
    var okDeps = prodDeps.filter(function (d) {
      return d.verdict === 'healthy' || d.verdict === 'stable';
    });
    var pendingDeps = prodDeps.filter(function (d) {
      return d.verdict === 'pending' || d.verdict === 'unresolved';
    });

    var html = '';

    // Summary cards (clickable)
    html += '<div class="deps-summary-cards" id="depsSummaryCards">';
    html += '<div class="deps-summary-card" data-filter="healthy" role="button" tabindex="0"><div class="deps-summary-card-value" style="color:#22c55e">' + (s.healthy || 0) + '</div><div class="deps-summary-card-label">✅ Healthy</div></div>';
    html += '<div class="deps-summary-card" data-filter="stable" role="button" tabindex="0"><div class="deps-summary-card-value" style="color:#eab308">' + (s.stable || 0) + '</div><div class="deps-summary-card-label">🟡 Stable</div></div>';
    html += '<div class="deps-summary-card" data-filter="degraded" role="button" tabindex="0"><div class="deps-summary-card-value" style="color:#f97316">' + (s.degraded || 0) + '</div><div class="deps-summary-card-label">⚠️ Degraded</div></div>';
    html += '<div class="deps-summary-card" data-filter="at-risk" role="button" tabindex="0"><div class="deps-summary-card-value" style="color:#ef4444">' + ((s.critical || 0) + (s.unmaintained || 0)) + '</div><div class="deps-summary-card-label">🔴 At Risk</div></div>';
    html += '</div>';

    // Incomplete notice
    if (!data.complete && data.pending > 0) {
      html += '<div class="deps-incomplete-notice">⏳ ' + data.pending + ' dependencies are still being scored. Auto-refreshing…</div>';
    }

    // Deps groups inside section card
    html += '<div class="deps-section-card">';
    html += '<input type="text" class="deps-search" id="depsSearch" placeholder="Search dependencies…" autocomplete="off" />';

    html += renderGroup('Attention', '⚠️', 'Needs Attention', needsAttention, true);
    html += renderGroup('Ok', '✅', 'Healthy & Stable', okDeps, false);
    html += renderGroup('Pending', '⏳', 'Pending / Unresolved', pendingDeps, false);
    html += renderGroup('Dev', '🔧', 'Dev Dependencies', devDeps, false);

    html += '</div>';

    // Install CTA
    if (owner && repo) {
      html += '<div class="install-cta">';
      html += '<div class="install-cta-text">';
      html += '<h2>🚀 Automate this in CI</h2>';
      html += '<p>Add dependency health checks to every pull request. Zero config for public repos.</p>';
      html += '<div class="install-cta-sub">Free for public repos · No API key needed · Powered by OIDC</div>';
      html += '</div>';
      html += '<a href="' + esc(buildInstallUrl(owner, repo)) + '" class="install-cta-btn" target="_blank" rel="noopener">Install Action →</a>';
      html += '</div>';
    }

    container.innerHTML = html;

    // Bind collapsible groups
    container.querySelectorAll('.deps-group-toggle').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var targetId = btn.getAttribute('data-target');
        var content = document.getElementById(targetId);
        if (!content) return;
        var visible = content.classList.toggle('visible');
        btn.classList.toggle('expanded', visible);
        btn.setAttribute('aria-expanded', visible ? 'true' : 'false');
      });
    });

    // Bind search
    var searchInput = document.getElementById('depsSearch');
    if (searchInput) {
      searchInput.addEventListener('input', function () {
        var query = this.value.toLowerCase();
        container.querySelectorAll('.dep-row').forEach(function (row) {
          var name = row.querySelector('.dep-name-text');
          if (!name) return;
          row.style.display = name.textContent.toLowerCase().indexOf(query) !== -1 ? '' : 'none';
        });
        if (query.length > 0) {
          container.querySelectorAll('.deps-group-content').forEach(function (c) { c.classList.add('visible'); });
          container.querySelectorAll('.deps-group-toggle').forEach(function (b) {
            b.classList.add('expanded');
            b.setAttribute('aria-expanded', 'true');
          });
        }
      });
    }

    // Bind clickable summary cards
    var activeFilter = null;
    container.querySelectorAll('.deps-summary-card[data-filter]').forEach(function (card) {
      card.addEventListener('click', function () {
        var filter = card.getAttribute('data-filter');

        if (activeFilter === filter) {
          activeFilter = null;
          container.querySelectorAll('.deps-summary-card').forEach(function (c) { c.classList.remove('active'); });
          container.querySelectorAll('.dep-row').forEach(function (r) { r.style.display = ''; });
          return;
        }

        activeFilter = filter;
        container.querySelectorAll('.deps-summary-card').forEach(function (c) { c.classList.remove('active'); });
        card.classList.add('active');

        var verdicts = [];
        if (filter === 'healthy') verdicts = ['healthy'];
        else if (filter === 'stable') verdicts = ['stable'];
        else if (filter === 'degraded') verdicts = ['degraded'];
        else if (filter === 'at-risk') verdicts = ['critical', 'unmaintained'];

        container.querySelectorAll('.dep-row').forEach(function (row) {
          var verdict = row.getAttribute('data-verdict');
          row.style.display = verdicts.indexOf(verdict) !== -1 ? '' : 'none';
        });

        container.querySelectorAll('.deps-group').forEach(function (group) {
          var hasVisible = group.querySelector('.dep-row:not([style*="display: none"])');
          var content = group.querySelector('.deps-group-content');
          var toggle = group.querySelector('.deps-group-toggle');
          if (hasVisible && content && toggle) {
            content.classList.add('visible');
            toggle.classList.add('expanded');
            toggle.setAttribute('aria-expanded', 'true');
          }
        });
      });
    });

    // Auto-retry if incomplete
    if (!data.complete && data.pending > 0) {
      setTimeout(function () { loadDeps(); }, 5000);
    }
  }

  function loadDeps() {
    var container = document.getElementById('depsContainer');
    if (!container) return;

    var owner = container.getAttribute('data-owner');
    var repo = container.getAttribute('data-repo');
    if (!owner || !repo) return;

    fetch('/_data/deps/github/' + encodeURIComponent(owner) + '/' + encodeURIComponent(repo))
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(renderDeps)
      .catch(function () {
        // Non-critical — hide the shimmer silently
        var shimmer = document.getElementById('depsShimmer');
        if (shimmer) shimmer.style.display = 'none';
      });
  }

  // Start loading
  loadDeps();
})();
