// ---------------------------------------------------------------------------
// Dependency Health Hydration — client-side script for result pages
//
// Fetches dependency health data from /_data/deps/github/:owner/:repo
// and renders:
//   1. Dep summary grid (in the dashboard grid card — #depSummaryGrid)
//   2. Full dep drilldown (in #depsContainer — collapsible groups)
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

    var s = data.summary || {};
    var activeChipFilter = null;

    // ── Populate the dashboard grid summary (2x2 mini-grid) ──
    var summaryGrid = document.getElementById('depSummaryGrid');
    var summaryContainer = document.getElementById('depSummaryContainer');
    if (summaryGrid && summaryContainer) {
      summaryGrid.innerHTML = ''
        + '<div class="dep-count-chip" data-filter="healthy" role="button" tabindex="0"><div class="dep-count-value" style="color:#22c55e">' + (s.healthy || 0) + '</div><div class="dep-count-label">✅ Healthy</div></div>'
        + '<div class="dep-count-chip" data-filter="stable" role="button" tabindex="0"><div class="dep-count-value" style="color:#eab308">' + (s.stable || 0) + '</div><div class="dep-count-label">🟡 Stable</div></div>'
        + '<div class="dep-count-chip" data-filter="degraded" role="button" tabindex="0"><div class="dep-count-value" style="color:#f97316">' + (s.degraded || 0) + '</div><div class="dep-count-label">⚠️ Degraded</div></div>'
        + '<div class="dep-count-chip" data-filter="at-risk" role="button" tabindex="0"><div class="dep-count-value" style="color:#ef4444">' + ((s.critical || 0) + (s.unmaintained || 0)) + '</div><div class="dep-count-label">🔴 At Risk</div></div>';

      // Bind click: scroll to deps + filter
      summaryGrid.querySelectorAll('.dep-count-chip[data-filter]').forEach(function (chip) {
        chip.addEventListener('click', function () {
          var filter = chip.getAttribute('data-filter');

          if (activeChipFilter === filter) {
            activeChipFilter = null;
            summaryGrid.querySelectorAll('.dep-count-chip').forEach(function (c) { c.classList.remove('active'); });
          } else {
            activeChipFilter = filter;
            summaryGrid.querySelectorAll('.dep-count-chip').forEach(function (c) { c.classList.remove('active'); });
            chip.classList.add('active');
          }

          applyDepsFilters();

          // Expand groups that have visible rows
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

          // Scroll to deps
          container.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      });
    }

    // ── Render the drilldown section (collapsible groups only) ──
    var prodDeps = data.dependencies.filter(function (d) { return !d.dev; });
    var devDeps = data.dependencies.filter(function (d) { return d.dev; });

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

    // Incomplete notice
    if (!data.complete && data.pending > 0) {
      html += '<div class="deps-incomplete-notice">⏳ ' + data.pending + ' dependencies are still being scored. Auto-refreshing…</div>';
    }

    // Deps groups inside section card
    html += '<div class="deps-section-card">';
    html += '<input type="text" class="deps-search" id="depsSearch" placeholder="Search ' + data.dependencies.length + ' dependencies…" autocomplete="off" />';

    html += renderGroup('Attention', '⚠️', 'Needs Attention', needsAttention, needsAttention.length > 0);
    html += renderGroup('Ok', '✅', 'Healthy & Stable', okDeps, false);
    html += renderGroup('Pending', '⏳', 'Pending / Unresolved', pendingDeps, false);
    html += renderGroup('Dev', '🔧', 'Dev Dependencies', devDeps, false);

    html += '</div>';

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

    // Compose search + chip filter
    var searchQuery = '';

    function applyDepsFilters() {
      container.querySelectorAll('.dep-row').forEach(function (row) {
        var name = row.querySelector('.dep-name-text');
        var verdict = row.getAttribute('data-verdict');

        var matchesSearch = !searchQuery || (name && name.textContent.toLowerCase().indexOf(searchQuery) !== -1);

        var matchesVerdict = true;
        if (activeChipFilter) {
          var verdicts = [];
          if (activeChipFilter === 'healthy') verdicts = ['healthy'];
          else if (activeChipFilter === 'stable') verdicts = ['stable'];
          else if (activeChipFilter === 'degraded') verdicts = ['degraded'];
          else if (activeChipFilter === 'at-risk') verdicts = ['critical', 'unmaintained'];
          matchesVerdict = verdicts.indexOf(verdict) !== -1;
        }

        row.style.display = (matchesSearch && matchesVerdict) ? '' : 'none';
      });
    }

    // Bind search
    var searchInput = document.getElementById('depsSearch');
    if (searchInput) {
      searchInput.addEventListener('input', function () {
        searchQuery = this.value.toLowerCase();
        applyDepsFilters();
        if (searchQuery.length > 0) {
          container.querySelectorAll('.deps-group-content').forEach(function (c) { c.classList.add('visible'); });
          container.querySelectorAll('.deps-group-toggle').forEach(function (b) {
            b.classList.add('expanded');
            b.setAttribute('aria-expanded', 'true');
          });
        }
      });
    }

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
