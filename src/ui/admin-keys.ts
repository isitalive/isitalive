// ---------------------------------------------------------------------------
// Admin API Keys page — list, create, revoke keys
// ---------------------------------------------------------------------------

import { adminLayout } from './admin-layout'
import type { KeyEntry } from '../admin/data'

export function adminKeysPage(keys: KeyEntry[], flash?: { type: 'success' | 'error'; message: string; key?: string }): string {
  return adminLayout({
    title: 'API Keys',
    activePage: 'keys',
    content: `
    <div class="admin-header">
      <h1>API Keys</h1>
      <p>Manage API keys for authenticated access. Keys are stored in Workers KV.</p>
    </div>

    ${flash ? `
      <div class="admin-alert ${flash.type}">
        ${flash.message}
        ${flash.key ? `<br><code style="font-size:0.9rem; background:var(--bg-secondary); padding:4px 8px; border-radius:4px; margin-top:8px; display:inline-block; user-select:all">${flash.key}</code>
        <br><small style="color:var(--text-muted)">⚠️ Copy this key now — it won't be shown again.</small>` : ''}
      </div>
    ` : ''}

    <div class="admin-section">
      <div class="admin-section-title">Create New Key</div>
      <form method="POST" action="/admin/api/keys" style="display:flex; gap:12px; align-items:flex-end; flex-wrap:wrap">
        <div class="form-group" style="flex:1; min-width:200px; margin-bottom:0">
          <label class="form-label" for="keyName">Name</label>
          <input class="form-input" type="text" id="keyName" name="name" placeholder="e.g. ACME Corp" required>
        </div>
        <div class="form-group" style="min-width:140px; margin-bottom:0">
          <label class="form-label" for="keyTier">Tier</label>
          <select class="form-select" id="keyTier" name="tier">
            <option value="free">Free</option>
            <option value="pro">Pro</option>
            <option value="enterprise">Enterprise</option>
          </select>
        </div>
        <button type="submit" class="btn btn-primary" style="height:42px">Create Key</button>
      </form>
    </div>

    <div class="admin-section">
      <div class="admin-section-title">Active Keys (${keys.length})</div>
      ${keys.length === 0 ? `
        <div style="text-align:center; padding:40px 0; color:var(--text-muted)">
          <p style="font-size:1.5rem; margin-bottom:8px">🔑</p>
          <p>No API keys yet. Create one above.</p>
        </div>
      ` : `
        <div class="admin-table-wrapper">
          <table class="admin-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Key ID</th>
                <th>Tier</th>
                <th>Created</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              ${keys.map(k => `
                <tr>
                  <td style="color:var(--text-primary); font-weight:500">${escapeHtml(k.name)}</td>
                  <td><code style="font-size:0.75rem; color:var(--text-muted)">${k.id.slice(0, 12)}…</code></td>
                  <td><span class="badge ${k.tier === 'enterprise' ? 'badge-green' : k.tier === 'pro' ? 'badge-yellow' : 'badge-gray'}">${k.tier}</span></td>
                  <td>${k.created ? new Date(k.created).toLocaleDateString() : '—'}</td>
                  <td>${k.active !== false
                    ? '<span class="badge badge-green">Active</span>'
                    : '<span class="badge badge-red">Revoked</span>'
                  }</td>
                  <td>
                    ${k.active !== false ? `
                      <form method="POST" action="/admin/api/keys/${k.id}/revoke" style="display:inline">
                        <button type="submit" class="btn btn-danger" style="padding:4px 10px; font-size:0.72rem"
                          onclick="return confirm('Revoke key ${escapeHtml(k.name)}?')">
                          Revoke
                        </button>
                      </form>
                    ` : '<span style="color:var(--text-muted)">—</span>'}
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `}
    </div>
    `,
  })
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
