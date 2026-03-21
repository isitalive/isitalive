// ---------------------------------------------------------------------------
// Admin login page — simple secret-based auth
// ---------------------------------------------------------------------------

export function adminLoginPage(error?: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="theme-color" content="#0a0a0f">
  <meta name="color-scheme" content="dark">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <title>Admin Login — IsItAlive</title>
  <meta name="robots" content="noindex, nofollow">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --bg-primary: #0a0a0f;
      --surface: rgba(255,255,255,0.04);
      --border: rgba(255,255,255,0.08);
      --text-primary: #e8e8ed;
      --text-secondary: #8b8b9e;
      --text-muted: #55556a;
      --accent: #6366f1;
      --accent-glow: rgba(99,102,241,0.3);
      --red: #ef4444;
    }

    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      background: var(--bg-primary);
      color: var(--text-primary);
      min-height: 100dvh;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .login-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 40px;
      width: 100%;
      max-width: 400px;
      text-align: center;
    }

    .login-icon {
      font-size: 2.5rem;
      margin-bottom: 16px;
    }

    .login-card h1 {
      font-size: 1.3rem;
      font-weight: 700;
      margin-bottom: 8px;
    }

    .login-card p {
      color: var(--text-secondary);
      font-size: 0.85rem;
      margin-bottom: 24px;
    }

    .login-input {
      width: 100%;
      background: rgba(0,0,0,0.3);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 14px 16px;
      color: var(--text-primary);
      font-family: 'Inter', sans-serif;
      font-size: 0.95rem;
      outline: none;
      text-align: center;
      letter-spacing: 2px;
      margin-bottom: 16px;
      transition: border-color 0.2s;
    }

    .login-input:focus {
      border-color: var(--accent);
      box-shadow: 0 0 0 3px var(--accent-glow);
    }

    .login-input::placeholder {
      color: var(--text-muted);
      letter-spacing: 0;
    }

    .login-btn {
      width: 100%;
      background: var(--accent);
      color: #fff;
      border: none;
      border-radius: 10px;
      padding: 14px;
      font-family: 'Inter', sans-serif;
      font-size: 0.95rem;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.2s, transform 0.1s;
    }

    .login-btn:hover { background: #5558e6; }
    .login-btn:active { transform: scale(0.98); }

    .login-error {
      background: rgba(239,68,68,0.12);
      border: 1px solid rgba(239,68,68,0.3);
      color: var(--red);
      border-radius: 8px;
      padding: 10px;
      font-size: 0.82rem;
      margin-bottom: 16px;
    }

    .login-footer {
      margin-top: 24px;
      font-size: 0.75rem;
      color: var(--text-muted);
    }

    .login-footer a {
      color: var(--text-secondary);
      text-decoration: none;
    }

    .login-footer a:hover { color: var(--accent); }
  </style>
</head>
<body>
  <div class="login-card">
    <div class="login-icon">🔐</div>
    <h1>Admin Access</h1>
    <p>Enter the admin secret to continue.</p>

    ${error ? `<div class="login-error">${error}</div>` : ''}

    <form method="POST" action="/admin/auth/login">
      <input
        type="password"
        name="secret"
        class="login-input"
        placeholder="Admin secret"
        required
        autofocus
        autocomplete="off"
      >
      <button type="submit" class="login-btn">Sign In</button>
    </form>

    <div class="login-footer">
      <a href="/">← Back to IsItAlive</a>
    </div>
  </div>
</body>
</html>`
}
