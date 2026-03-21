// ---------------------------------------------------------------------------
// Error page HTML
// ---------------------------------------------------------------------------

export function errorPage(message: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
  <meta name="theme-color" content="#0a0a0f">
  <title>Error — Is It Alive?</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      background: #0a0a0f;
      color: #e8e8ed;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .error-card {
      text-align: center;
      max-width: 440px;
      padding: 40px;
    }
    .error-icon {
      font-size: 3rem;
      margin-bottom: 20px;
    }
    h1 {
      font-size: 1.3rem;
      font-weight: 700;
      margin-bottom: 12px;
    }
    p {
      color: #8b8b9e;
      font-size: 0.9rem;
      line-height: 1.6;
      margin-bottom: 28px;
    }
    .error-detail {
      background: rgba(255,255,255,0.04);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 12px;
      padding: 16px;
      font-family: 'SF Mono', monospace;
      font-size: 0.8rem;
      color: #ef4444;
      margin-bottom: 28px;
      word-break: break-word;
    }
    a {
      display: inline-block;
      background: #6366f1;
      color: #fff;
      text-decoration: none;
      padding: 12px 28px;
      border-radius: 12px;
      font-weight: 600;
      font-size: 0.9rem;
      transition: background 0.2s;
    }
    a:hover { background: #5558e6; }
  </style>
</head>
<body>
  <div class="error-card">
    <div class="error-icon">💀</div>
    <h1>Something went wrong</h1>
    <p>We couldn't check that project. It might not exist, or something broke on our end.</p>
    <div class="error-detail">${escapeHtml(message)}</div>
    <a href="/">← Try another project</a>
  </div>
</body>
</html>`;
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
