// ---------------------------------------------------------------------------
// Admin layout — shared shell for all admin pages
//
// Same dark glassmorphism aesthetic as the public site.
// Sidebar nav + content area. Inlines all CSS (no external deps).
// ---------------------------------------------------------------------------

export interface AdminLayoutOpts {
  title: string
  activePage: 'overview' | 'keys' | 'query' | 'jobs'
  content: string
  /** Extra <script> tags to append before </body> */
  scripts?: string
  /** Extra <style> rules to append inside <style> */
  styles?: string
}

export function adminLayout(opts: AdminLayoutOpts): string {
  const { title, activePage, content, scripts = '', styles = '' } = opts

  const navItems = [
    { id: 'overview', label: '📊 Overview', href: '/admin' },
    { id: 'keys', label: '🔑 API Keys', href: '/admin/keys' },
    { id: 'query', label: '🔍 Query Console', href: '/admin/query' },
    { id: 'jobs', label: '⚡ Jobs', href: '/admin/jobs' },
  ]

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="dark">
  <title>${title} — IsItAlive Admin</title>
  <meta name="robots" content="noindex, nofollow">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --bg-primary: #0a0a0f;
      --bg-secondary: #12121a;
      --bg-tertiary: #1a1a28;
      --surface: rgba(255,255,255,0.04);
      --surface-hover: rgba(255,255,255,0.08);
      --surface-active: rgba(99,102,241,0.12);
      --border: rgba(255,255,255,0.08);
      --border-active: rgba(99,102,241,0.4);
      --text-primary: #e8e8ed;
      --text-secondary: #8b8b9e;
      --text-muted: #55556a;
      --accent: #6366f1;
      --accent-hover: #5558e6;
      --accent-glow: rgba(99,102,241,0.3);
      --green: #22c55e;
      --yellow: #eab308;
      --orange: #f97316;
      --red: #ef4444;
      --gray: #6b7280;
      --sidebar-width: 240px;
    }

    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      background: var(--bg-primary);
      color: var(--text-primary);
      min-height: 100dvh;
      display: flex;
    }

    /* ── Sidebar ──────────────────────────── */
    .admin-sidebar {
      width: var(--sidebar-width);
      min-height: 100dvh;
      background: var(--bg-secondary);
      border-right: 1px solid var(--border);
      padding: 24px 0;
      position: fixed;
      top: 0;
      left: 0;
      display: flex;
      flex-direction: column;
    }

    .admin-brand {
      padding: 0 20px 24px;
      border-bottom: 1px solid var(--border);
      margin-bottom: 16px;
    }

    .admin-brand a {
      font-size: 0.75rem;
      font-weight: 700;
      letter-spacing: 2px;
      text-transform: uppercase;
      color: var(--accent);
      text-decoration: none;
    }

    .admin-brand .admin-tag {
      display: inline-block;
      font-size: 0.6rem;
      font-weight: 600;
      color: var(--bg-primary);
      background: var(--accent);
      padding: 2px 6px;
      border-radius: 4px;
      margin-left: 8px;
      letter-spacing: 1px;
      vertical-align: middle;
    }

    .admin-nav {
      list-style: none;
      padding: 0 8px;
      flex: 1;
    }

    .admin-nav li {
      margin-bottom: 2px;
    }

    .admin-nav a {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 12px;
      border-radius: 8px;
      color: var(--text-secondary);
      text-decoration: none;
      font-size: 0.85rem;
      font-weight: 500;
      transition: all 0.15s;
    }

    .admin-nav a:hover {
      background: var(--surface-hover);
      color: var(--text-primary);
    }

    .admin-nav a.active {
      background: var(--surface-active);
      color: var(--accent);
      border: 1px solid var(--border-active);
    }

    .admin-sidebar-footer {
      padding: 16px 20px;
      border-top: 1px solid var(--border);
    }

    .admin-sidebar-footer a {
      display: flex;
      align-items: center;
      gap: 8px;
      color: var(--text-muted);
      text-decoration: none;
      font-size: 0.78rem;
      transition: color 0.2s;
    }

    .admin-sidebar-footer a:hover {
      color: var(--red);
    }

    /* ── Main content ─────────────────────── */
    .admin-main {
      margin-left: var(--sidebar-width);
      flex: 1;
      padding: 32px 40px;
      max-width: 1200px;
    }

    .admin-header {
      margin-bottom: 32px;
    }

    .admin-header h1 {
      font-size: 1.6rem;
      font-weight: 700;
      letter-spacing: -0.02em;
      margin-bottom: 6px;
    }

    .admin-header p {
      color: var(--text-secondary);
      font-size: 0.85rem;
    }

    /* ── Cards ─────────────────────────────── */
    .card-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
      gap: 16px;
      margin-bottom: 32px;
    }

    .card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 20px;
      transition: border-color 0.2s;
    }

    .card:hover {
      border-color: rgba(255,255,255,0.15);
    }

    .card-label {
      font-size: 0.72rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: var(--text-muted);
      margin-bottom: 8px;
    }

    .card-value {
      font-size: 2rem;
      font-weight: 800;
      letter-spacing: -0.03em;
      line-height: 1;
    }

    .card-sub {
      font-size: 0.75rem;
      color: var(--text-secondary);
      margin-top: 6px;
    }

    /* ── Tables ────────────────────────────── */
    .admin-table-wrapper {
      overflow-x: auto;
      border: 1px solid var(--border);
      border-radius: 12px;
      background: var(--surface);
    }

    .admin-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.82rem;
    }

    .admin-table th {
      text-align: left;
      padding: 12px 16px;
      font-size: 0.7rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: var(--text-muted);
      border-bottom: 1px solid var(--border);
      position: sticky;
      top: 0;
      background: var(--bg-secondary);
    }

    .admin-table td {
      padding: 10px 16px;
      border-bottom: 1px solid var(--border);
      color: var(--text-secondary);
    }

    .admin-table tr:last-child td {
      border-bottom: none;
    }

    .admin-table tr:hover td {
      background: var(--surface-hover);
    }

    /* ── Buttons ───────────────────────────── */
    .btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 8px 16px;
      border-radius: 8px;
      font-family: 'Inter', sans-serif;
      font-size: 0.82rem;
      font-weight: 600;
      border: none;
      cursor: pointer;
      transition: all 0.15s;
    }

    .btn-primary {
      background: var(--accent);
      color: #fff;
    }

    .btn-primary:hover { background: var(--accent-hover); }
    .btn-primary:active { transform: scale(0.97); }

    .btn-danger {
      background: rgba(239,68,68,0.15);
      color: var(--red);
      border: 1px solid rgba(239,68,68,0.2);
    }

    .btn-danger:hover {
      background: rgba(239,68,68,0.25);
    }

    .btn-ghost {
      background: var(--surface);
      color: var(--text-secondary);
      border: 1px solid var(--border);
    }

    .btn-ghost:hover {
      background: var(--surface-hover);
      color: var(--text-primary);
    }

    /* ── Forms ─────────────────────────────── */
    .form-group {
      margin-bottom: 16px;
    }

    .form-label {
      display: block;
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--text-secondary);
      margin-bottom: 6px;
    }

    .form-input, .form-select, .form-textarea {
      width: 100%;
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 10px 14px;
      color: var(--text-primary);
      font-family: 'Inter', sans-serif;
      font-size: 0.85rem;
      outline: none;
      transition: border-color 0.2s;
    }

    .form-input:focus, .form-select:focus, .form-textarea:focus {
      border-color: var(--accent);
      box-shadow: 0 0 0 3px var(--accent-glow);
    }

    .form-textarea {
      font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
      font-size: 0.8rem;
      resize: vertical;
      min-height: 120px;
      line-height: 1.6;
    }

    /* ── Badges ────────────────────────────── */
    .badge {
      display: inline-block;
      padding: 3px 8px;
      border-radius: 6px;
      font-size: 0.7rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .badge-green { background: rgba(34,197,94,0.15); color: var(--green); }
    .badge-red { background: rgba(239,68,68,0.15); color: var(--red); }
    .badge-yellow { background: rgba(234,179,8,0.15); color: var(--yellow); }
    .badge-gray { background: rgba(107,114,128,0.15); color: var(--gray); }

    /* ── Status dot ───────────────────────── */
    .status-dot {
      display: inline-block;
      width: 8px;
      height: 8px;
      border-radius: 50%;
      margin-right: 6px;
    }

    /* ── Section ───────────────────────────── */
    .admin-section {
      margin-bottom: 32px;
    }

    .admin-section-title {
      font-size: 0.95rem;
      font-weight: 700;
      margin-bottom: 16px;
      letter-spacing: -0.01em;
    }

    /* ── Toast / Alert ────────────────────── */
    .admin-alert {
      padding: 12px 16px;
      border-radius: 8px;
      font-size: 0.82rem;
      margin-bottom: 16px;
      display: none;
    }

    .admin-alert.success {
      background: rgba(34,197,94,0.12);
      border: 1px solid rgba(34,197,94,0.3);
      color: var(--green);
      display: block;
    }

    .admin-alert.error {
      background: rgba(239,68,68,0.12);
      border: 1px solid rgba(239,68,68,0.3);
      color: var(--red);
      display: block;
    }

    /* ── Responsive ───────────────────────── */
    @media (max-width: 768px) {
      .admin-sidebar {
        width: 100%;
        min-height: auto;
        position: relative;
        border-right: none;
        border-bottom: 1px solid var(--border);
        padding: 16px 0;
      }

      .admin-nav {
        display: flex;
        gap: 4px;
        overflow-x: auto;
        padding: 0 12px;
      }

      .admin-main {
        margin-left: 0;
        padding: 24px 16px;
      }

      body { flex-direction: column; }

      .card-grid { grid-template-columns: 1fr 1fr; }
    }

    ${styles}
  </style>
</head>
<body>
  <aside class="admin-sidebar">
    <div class="admin-brand">
      <a href="/">Is It Alive</a>
      <span class="admin-tag">Admin</span>
    </div>
    <ul class="admin-nav">
      ${navItems.map(item => `
        <li><a href="${item.href}" class="${activePage === item.id ? 'active' : ''}">${item.label}</a></li>
      `).join('')}
    </ul>
    <div class="admin-sidebar-footer">
      <a href="/admin/auth/logout">🚪 Sign out</a>
    </div>
  </aside>

  <main class="admin-main">
    ${content}
  </main>

  ${scripts}
</body>
</html>`
}
