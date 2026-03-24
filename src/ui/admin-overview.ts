// ---------------------------------------------------------------------------
// Admin dashboard — live operational metrics
//
// Fetches metrics client-side via /admin/api/query (R2 SQL).
// Shows: cache layer perf, request volume, traffic breakdown, pipeline health.
// ---------------------------------------------------------------------------

import { adminLayout } from './admin-layout'
import type { AdminOverview } from '../admin/data'

export function adminOverviewPage(data: AdminOverview): string {
  return adminLayout({
    title: 'Dashboard',
    activePage: 'dashboard',
    content: `
    <div class="admin-header">
      <h1>Dashboard</h1>
      <p>Live operational metrics · auto-refreshes every 60s</p>
    </div>

    <!-- ── Cache Layer Performance ──────────────────── -->
    <div class="admin-section">
      <div class="admin-section-title">Cache Performance <span class="period-label">24h</span></div>
      <div class="card-grid cache-cards" id="cache-cards">
        <div class="card shimmer">
          <div class="card-label">L1 · Cache API</div>
          <div class="card-value" id="l1-pct">—</div>
          <div class="card-sub" id="l1-count">Loading…</div>
        </div>
        <div class="card shimmer">
          <div class="card-label">L2 · KV Fresh</div>
          <div class="card-value" id="l2-pct">—</div>
          <div class="card-sub" id="l2-count">Loading…</div>
        </div>
        <div class="card shimmer">
          <div class="card-label">L2 · KV Stale (SWR)</div>
          <div class="card-value" id="stale-pct">—</div>
          <div class="card-sub" id="stale-count">Loading…</div>
        </div>
        <div class="card shimmer">
          <div class="card-label">L3 · Origin</div>
          <div class="card-value" id="miss-pct">—</div>
          <div class="card-sub" id="miss-count">Loading…</div>
        </div>
      </div>
    </div>

    <!-- ── Request Volume ───────────────────────────── -->
    <div class="admin-section">
      <div class="admin-section-title">Request Volume <span class="period-label">24h</span></div>
      <div class="card-grid volume-cards">
        <div class="card shimmer">
          <div class="card-label">Total Requests</div>
          <div class="card-value" id="total-reqs">—</div>
          <div class="card-sub" id="total-sub">Loading…</div>
        </div>
        <div class="card shimmer">
          <div class="card-label">Avg Response Time</div>
          <div class="card-value" id="avg-rt">—</div>
          <div class="card-sub">Across all tiers</div>
        </div>
        <div class="card shimmer">
          <div class="card-label">Origin Avg RT</div>
          <div class="card-value" id="origin-rt">—</div>
          <div class="card-sub">Cache misses only</div>
        </div>
        <div class="card shimmer">
          <div class="card-label">Cache Hit Rate</div>
          <div class="card-value" id="hit-rate">—</div>
          <div class="card-sub">L1 + L2 + SWR</div>
        </div>
      </div>
    </div>

    <!-- ── Traffic Breakdown ────────────────────────── -->
    <div class="admin-section">
      <div class="admin-section-title">Traffic Breakdown <span class="period-label">24h</span></div>
      <div class="breakdown-grid">
        <div class="breakdown-panel">
          <div class="breakdown-label">By Source</div>
          <div id="source-breakdown" class="breakdown-list">
            <div class="shimmer-row"></div>
            <div class="shimmer-row"></div>
            <div class="shimmer-row"></div>
          </div>
        </div>
        <div class="breakdown-panel">
          <div class="breakdown-label">By User Agent</div>
          <div id="ua-breakdown" class="breakdown-list">
            <div class="shimmer-row"></div>
            <div class="shimmer-row"></div>
            <div class="shimmer-row"></div>
          </div>
        </div>
      </div>
    </div>

    <!-- ── Pipeline Health ──────────────────────────── -->
    <div class="admin-section">
      <div class="admin-section-title">Pipeline Health</div>
      <div class="admin-table-wrapper">
        <table class="admin-table" id="pipeline-table">
          <thead>
            <tr>
              <th>Table</th>
              <th>Rows</th>
              <th>Latest Ingest</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            <tr><td colspan="4" style="color:var(--text-muted)">Loading…</td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- ── Tracked Repos ────────────────────────────── -->
    <div class="admin-section">
      <div class="admin-section-title">Index</div>
      <div class="card-grid">
        <div class="card">
          <div class="card-label">Tracked Repos</div>
          <div class="card-value">${data.trackedRepoCount.toLocaleString()}</div>
          <div class="card-sub">Total repos in the index</div>
        </div>
        <div class="card">
          <div class="card-label">🔥 Hot</div>
          <div class="card-value" style="color:var(--green)">${data.hotRepoCount.toLocaleString()}</div>
          <div class="card-sub">Requested in last 7 days</div>
        </div>
        <div class="card">
          <div class="card-label">🌤 Warm</div>
          <div class="card-value" style="color:var(--yellow)">${data.warmRepoCount.toLocaleString()}</div>
          <div class="card-sub">Requested in last 30 days</div>
        </div>
        <div class="card">
          <div class="card-label">❄️ Cold</div>
          <div class="card-value" style="color:var(--text-muted)">${data.coldRepoCount.toLocaleString()}</div>
          <div class="card-sub">Older than 30 days</div>
        </div>
        <div class="card">
          <div class="card-label">Trending (24h)</div>
          <div class="card-value">${data.trendingCount}</div>
          <div class="card-sub">Repos in trending list</div>
        </div>
      </div>
    </div>
    `,
    styles: `
      .period-label {
        font-size: 0.65rem;
        font-weight: 500;
        color: var(--accent);
        background: rgba(99,102,241,0.12);
        padding: 2px 8px;
        border-radius: 4px;
        margin-left: 8px;
        vertical-align: middle;
      }

      /* Shimmer loading */
      .shimmer .card-value,
      .shimmer .card-sub {
        color: transparent;
        background: linear-gradient(90deg, var(--surface) 25%, var(--surface-hover) 50%, var(--surface) 75%);
        background-size: 200% 100%;
        animation: shimmer 1.5s infinite;
        border-radius: 4px;
        display: inline-block;
        min-width: 60px;
      }
      .shimmer-row {
        height: 36px;
        background: linear-gradient(90deg, var(--surface) 25%, var(--surface-hover) 50%, var(--surface) 75%);
        background-size: 200% 100%;
        animation: shimmer 1.5s infinite;
        border-radius: 6px;
        margin-bottom: 8px;
      }
      @keyframes shimmer {
        0% { background-position: 200% 0; }
        100% { background-position: -200% 0; }
      }

      /* Breakdown panels */
      .breakdown-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 16px;
      }
      .breakdown-panel {
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: 12px;
        padding: 20px;
      }
      .breakdown-label {
        font-size: 0.72rem;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 1px;
        color: var(--text-muted);
        margin-bottom: 14px;
      }
      .breakdown-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 8px 0;
        border-bottom: 1px solid var(--border);
        font-size: 0.82rem;
      }
      .breakdown-item:last-child { border-bottom: none; }
      .breakdown-item-name {
        color: var(--text-primary);
        font-weight: 500;
      }
      .breakdown-item-count {
        color: var(--text-secondary);
        font-variant-numeric: tabular-nums;
      }
      .breakdown-item-bar {
        height: 4px;
        border-radius: 2px;
        background: var(--accent);
        margin-top: 4px;
        opacity: 0.6;
        transition: width 0.4s ease;
      }

      /* Loaded state — remove shimmer */
      .card.loaded { animation: none; }
      .card.loaded .card-value,
      .card.loaded .card-sub {
        color: inherit;
        background: none;
        animation: none;
        min-width: auto;
      }
      .card.loaded .card-value { color: var(--text-primary); }
      .card.loaded .card-sub { color: var(--text-secondary); }

      /* Status indicator in pipeline table */
      .status-fresh { color: var(--green); }
      .status-stale { color: var(--yellow); }
      .status-dead { color: var(--red); }

      @media (max-width: 768px) {
        .breakdown-grid { grid-template-columns: 1fr; }
      }
    `,
    scripts: `<script>
      const QUERIES = {
        cache: \`
          SELECT cache_status, COUNT(*) as count
          FROM usage_events
          WHERE timestamp > (now() - INTERVAL '24' HOUR)
            AND cache_status != 'n/a'
          GROUP BY cache_status
        \`,
        volume: \`
          SELECT
            COUNT(*) as total,
            ROUND(AVG(response_time_ms), 1) as avg_rt,
            ROUND(AVG(CASE WHEN cache_status = 'miss' THEN response_time_ms END), 1) as origin_rt
          FROM usage_events
          WHERE timestamp > (now() - INTERVAL '24' HOUR)
            AND cache_status != 'n/a'
        \`,
        source: \`
          SELECT source, COUNT(*) as count
          FROM usage_events
          WHERE timestamp > (now() - INTERVAL '24' HOUR)
          GROUP BY source
          ORDER BY count DESC
        \`,
        ua: \`
          SELECT user_agent, COUNT(*) as count
          FROM usage_events
          WHERE timestamp > (now() - INTERVAL '24' HOUR)
          GROUP BY user_agent
          ORDER BY count DESC
        \`,
        pipeline_usage: \`SELECT 'usage_events' as tbl, COUNT(*) as rows, MAX(__ingest_ts) as latest FROM usage_events\`,
        pipeline_result: \`SELECT 'result_events_v2' as tbl, COUNT(*) as rows, MAX(__ingest_ts) as latest FROM result_events_v2\`,
        pipeline_provider: \`SELECT 'provider_events_v2' as tbl, COUNT(*) as rows, MAX(__ingest_ts) as latest FROM provider_events_v2\`,
        pipeline_manifest: \`SELECT 'manifest_events' as tbl, COUNT(*) as rows, MAX(__ingest_ts) as latest FROM manifest_events\`,
      };

      async function runQuery(sql) {
        const res = await fetch('/admin/api/query', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sql }),
        });
        return res.json();
      }

      function fmt(n) {
        if (n == null || isNaN(n)) return '—';
        return Number(n).toLocaleString();
      }

      function pct(n, total) {
        if (!total) return '0%';
        return (n / total * 100).toFixed(1) + '%';
      }

      function markLoaded(el) {
        el.classList.remove('shimmer');
        el.classList.add('loaded');
      }

      function timeAgo(ts) {
        if (!ts) return 'never';
        const diff = (Date.now() - new Date(ts).getTime()) / 1000;
        if (diff < 60) return Math.round(diff) + 's ago';
        if (diff < 3600) return Math.round(diff / 60) + 'min ago';
        if (diff < 86400) return Math.round(diff / 3600) + 'h ago';
        return Math.round(diff / 86400) + 'd ago';
      }

      async function loadCache() {
        try {
          const data = await runQuery(QUERIES.cache);
          const map = {};
          let total = 0;
          for (const row of data.rows) {
            map[row[0]] = parseInt(row[1]);
            total += parseInt(row[1]);
          }

          const l1 = map['l1-hit'] || 0;
          const l2 = map['hit'] || 0;
          const stale = map['stale'] || 0;
          const miss = map['miss'] || 0;

          document.getElementById('l1-pct').textContent = pct(l1, total);
          document.getElementById('l1-count').textContent = fmt(l1) + ' requests';
          document.getElementById('l2-pct').textContent = pct(l2, total);
          document.getElementById('l2-count').textContent = fmt(l2) + ' requests';
          document.getElementById('stale-pct').textContent = pct(stale, total);
          document.getElementById('stale-count').textContent = fmt(stale) + ' requests';
          document.getElementById('miss-pct').textContent = pct(miss, total);
          document.getElementById('miss-count').textContent = fmt(miss) + ' requests';

          // Color the L3 miss card if high
          const missRate = total > 0 ? miss / total : 0;
          const missCard = document.getElementById('miss-pct');
          if (missRate > 0.5) missCard.style.color = 'var(--red)';
          else if (missRate > 0.3) missCard.style.color = 'var(--yellow)';
          else missCard.style.color = 'var(--green)';

          // Color L1
          document.getElementById('l1-pct').style.color = 'var(--accent)';
          document.getElementById('l2-pct').style.color = 'var(--green)';
          document.getElementById('stale-pct').style.color = 'var(--yellow)';

          document.querySelectorAll('#cache-cards .card').forEach(markLoaded);
        } catch (e) {
          console.error('Cache query failed:', e);
        }
      }

      async function loadVolume() {
        try {
          const data = await runQuery(QUERIES.volume);
          if (data.rows.length) {
            const [total, avgRt, originRt] = data.rows[0];
            const totalNum = parseInt(total) || 0;
            document.getElementById('total-reqs').textContent = fmt(totalNum);
            document.getElementById('total-sub').textContent = 'In the last 24 hours';
            document.getElementById('avg-rt').textContent = (avgRt || 0) + 'ms';
            document.getElementById('origin-rt').textContent = (originRt || 0) + 'ms';

            // Calc hit rate from cache query (run after cache loads)
            const cacheData = await runQuery(QUERIES.cache);
            let cacheTotal = 0, hits = 0;
            for (const row of cacheData.rows) {
              const count = parseInt(row[1]);
              cacheTotal += count;
              if (row[0] !== 'miss') hits += count;
            }
            document.getElementById('hit-rate').textContent = pct(hits, cacheTotal);
            document.getElementById('hit-rate').style.color = 'var(--green)';
          }
          document.querySelectorAll('.volume-cards .card').forEach(markLoaded);
        } catch (e) {
          console.error('Volume query failed:', e);
        }
      }

      function renderBreakdown(containerId, data) {
        const container = document.getElementById(containerId);
        if (!data.rows.length) {
          container.innerHTML = '<div style="color:var(--text-muted);font-size:0.82rem">No data</div>';
          return;
        }
        const maxCount = Math.max(...data.rows.map(r => parseInt(r[1])));
        container.innerHTML = data.rows.map(row => {
          const name = row[0] || 'unknown';
          const count = parseInt(row[1]);
          const barWidth = (count / maxCount * 100).toFixed(0);
          return \`
            <div class="breakdown-item">
              <div style="flex:1">
                <div class="breakdown-item-name">\${name}</div>
                <div class="breakdown-item-bar" style="width: \${barWidth}%"></div>
              </div>
              <div class="breakdown-item-count">\${fmt(count)}</div>
            </div>\`;
        }).join('');
      }

      async function loadBreakdowns() {
        try {
          const [sourceData, uaData] = await Promise.all([
            runQuery(QUERIES.source),
            runQuery(QUERIES.ua),
          ]);
          renderBreakdown('source-breakdown', sourceData);
          renderBreakdown('ua-breakdown', uaData);
        } catch (e) {
          console.error('Breakdown query failed:', e);
        }
      }

      async function loadPipeline() {
        try {
          const pipelineKeys = ['pipeline_usage', 'pipeline_result', 'pipeline_provider', 'pipeline_manifest'];
          const results = await Promise.allSettled(pipelineKeys.map(k => runQuery(QUERIES[k])));
          const allRows = [];
          for (const r of results) {
            if (r.status === 'fulfilled' && r.value.rows && r.value.rows.length) {
              allRows.push(r.value.rows[0]);
            }
          }
          const tbody = document.querySelector('#pipeline-table tbody');
          if (!allRows.length) {
            tbody.innerHTML = '<tr><td colspan="4" style="color:var(--text-muted)">No data</td></tr>';
            return;
          }
          tbody.innerHTML = allRows.map(row => {
            const [name, rows, latest] = row;
            const ago = timeAgo(latest);
            const diffSec = latest ? (Date.now() - new Date(latest).getTime()) / 1000 : Infinity;
            let statusClass = 'status-fresh';
            let statusIcon = '\ud83d\udfe2';
            if (diffSec > 3600) { statusClass = 'status-stale'; statusIcon = '\ud83d\udfe1'; }
            if (diffSec > 86400) { statusClass = 'status-dead'; statusIcon = '\ud83d\udd34'; }
            return \`<tr>
              <td><code style="font-size:0.78rem">\${name}</code></td>
              <td>\${fmt(parseInt(rows))}</td>
              <td>\${ago}</td>
              <td class="\${statusClass}">\${statusIcon} \${diffSec < 3600 ? 'Healthy' : diffSec < 86400 ? 'Delayed' : 'Down'}</td>
            </tr>\`;
          }).join('');
        } catch (e) {
          console.error('Pipeline query failed:', e);
          document.querySelector('#pipeline-table tbody').innerHTML =
            '<tr><td colspan="4" style="color:var(--red)">Query failed</td></tr>';
        }
      }

      async function refreshAll() {
        await Promise.all([loadCache(), loadVolume(), loadBreakdowns(), loadPipeline()]);
      }

      // Initial load + auto-refresh
      refreshAll();
      setInterval(refreshAll, 60000);
    </script>`,
  })
}
