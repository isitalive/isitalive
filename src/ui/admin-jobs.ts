// ---------------------------------------------------------------------------
// Admin jobs page — manual cron triggers and workflow management
// ---------------------------------------------------------------------------

import { adminLayout } from './admin-layout'

export function adminJobsPage(): string {
  return adminLayout({
    title: 'Jobs',
    activePage: 'jobs',
    content: `
    <div class="admin-header">
      <h1>Jobs</h1>
      <p>Manually trigger cron aggregations and workflows</p>
    </div>

    <div id="job-alert" class="admin-alert"></div>

    <div class="admin-section">
      <div class="admin-section-title">Cron Aggregation</div>
      <p style="color:var(--text-secondary); font-size:0.82rem; margin-bottom:16px">
        Queries Iceberg tables and refreshes KV-cached materialized views.
        Normally runs every 10 minutes via <code style="background:var(--surface); padding:2px 6px; border-radius:4px; font-size:0.78rem">*/10 * * * *</code>.
      </p>

      <div class="job-grid">
        <div class="card">
          <div class="card-label">🔥 Refresh All</div>
          <div class="card-sub" style="margin-bottom:12px">Trending + Tracked + Sitemap from Iceberg</div>
          <button class="btn btn-primary" id="btn-cron" onclick="triggerJob('cron')">▶ Run Now</button>
          <div class="job-result" id="result-cron"></div>
        </div>
      </div>
    </div>

    <div class="admin-section">
      <div class="admin-section-title">Workflows</div>
      <p style="color:var(--text-secondary); font-size:0.82rem; margin-bottom:16px">
        Durable multi-step workflows for repo ingestion and cache warming.
      </p>

      <div class="job-grid">
        <div class="card">
          <div class="card-label">📥 Ingest Workflow</div>
          <div class="card-sub" style="margin-bottom:12px">Fetch &amp; score GitHub trending + tracked repos</div>
          <button class="btn btn-ghost" id="btn-ingest" onclick="triggerJob('ingest')">▶ Dispatch</button>
          <div class="job-result" id="result-ingest"></div>
        </div>
        <div class="card">
          <div class="card-label">♻️ Refresh Workflow</div>
          <div class="card-sub" style="margin-bottom:12px">Re-score stale tracked repos within budget</div>
          <button class="btn btn-ghost" id="btn-refresh" onclick="triggerJob('refresh')">▶ Dispatch</button>
          <div class="job-result" id="result-refresh"></div>
        </div>
      </div>
    </div>
    `,
    styles: `
      .job-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
        gap: 16px;
      }
      .job-result {
        margin-top: 12px;
        font-size: 0.78rem;
        color: var(--text-secondary);
        font-family: 'SF Mono', 'Fira Code', monospace;
        white-space: pre-wrap;
        max-height: 200px;
        overflow-y: auto;
      }
      .btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
    `,
    scripts: `<script>
      async function triggerJob(type) {
        const btn = document.getElementById('btn-' + type);
        const result = document.getElementById('result-' + type);
        const alert = document.getElementById('job-alert');

        btn.disabled = true;
        btn.textContent = '⏳ Running...';
        result.textContent = '';
        alert.className = 'admin-alert';

        try {
          const res = await fetch('/admin/api/' + type, { method: 'POST' });
          const data = await res.json();

          if (res.ok) {
            alert.className = 'admin-alert success';
            alert.textContent = '✓ ' + type + ' completed successfully';
            result.textContent = JSON.stringify(data, null, 2);
          } else {
            alert.className = 'admin-alert error';
            alert.textContent = '✗ ' + type + ' failed: ' + (data.error || res.status);
            result.textContent = JSON.stringify(data, null, 2);
          }
        } catch (err) {
          alert.className = 'admin-alert error';
          alert.textContent = '✗ Network error: ' + err.message;
        }

        btn.disabled = false;
        btn.textContent = '▶ ' + (type === 'cron' ? 'Run Now' : 'Dispatch');
      }
    </script>`,
  })
}
