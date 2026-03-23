// ---------------------------------------------------------------------------
// Admin overview dashboard — tracked repos, trending, rate limit config
// ---------------------------------------------------------------------------

import { adminLayout } from './admin-layout'
import type { AdminOverview } from '../admin/data'

export function adminOverviewPage(data: AdminOverview): string {
  return adminLayout({
    title: 'Overview',
    activePage: 'overview',
    content: `
    <div class="admin-header">
      <h1>Dashboard</h1>
      <p>System overview and operational metrics</p>
    </div>

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

    <div class="admin-section">
      <div class="admin-section-title">Rate Limit Configuration</div>
      <p style="color:var(--text-secondary); font-size:0.82rem; margin-bottom:16px">
        These limits are code-defined in <code style="background:transparent; padding:2px 6px; border-radius:4px; font-size:0.78rem">src/middleware/rateLimit.ts</code>.
        Changes go through PRs.
      </p>
      <div class="admin-table-wrapper">
        <table class="admin-table">
          <thead>
            <tr>
              <th>Tier</th>
              <th>Limit</th>
              <th>Window</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${data.tierLimits.map(t => `
              <tr>
                <td><span class="badge ${t.tier === 'enterprise' ? 'badge-green' : t.tier === 'pro' ? 'badge-yellow' : 'badge-gray'}">${t.tier}</span></td>
                <td>${t.limit} req</td>
                <td>${t.period}s</td>
                <td><span class="status-dot" style="background:var(--green)"></span>Active</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
    `,
  })
}
