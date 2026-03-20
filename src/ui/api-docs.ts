// ---------------------------------------------------------------------------
// API documentation page — interactive reference for the Is It Alive? API
// ---------------------------------------------------------------------------

import { navbarHtml, footerHtml, componentCss } from './components';

export function apiDocsPage(analyticsToken?: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>API Reference — Is It Alive?</title>
  <meta name="description" content="API documentation for Is It Alive? — check open-source project health with a single HTTP request.">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    ${componentCss}

    :root {
      --bg-primary: #0a0a0f;
      --bg-secondary: #12121a;
      --surface: rgba(255,255,255,0.04);
      --border: rgba(255,255,255,0.08);
      --text-primary: #e8e8ed;
      --text-secondary: #8b8b9e;
      --text-muted: #55556a;
      --accent: #6366f1;
      --green: #22c55e;
      --yellow: #eab308;
      --orange: #f97316;
      --red: #ef4444;
    }

    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      background: var(--bg-primary);
      color: var(--text-primary);
      min-height: 100vh;
    }

    .bg-orb { position: fixed; border-radius: 50%; pointer-events: none; z-index: 0; }
    .bg-orb-1 { width: 600px; height: 600px; background: radial-gradient(circle, rgba(99,102,241,0.12) 0%, transparent 70%); top: -200px; left: -150px; }
    .bg-orb-2 { width: 400px; height: 400px; background: radial-gradient(circle, rgba(139,92,246,0.1) 0%, transparent 70%); bottom: -150px; right: -100px; }

    .container {
      position: relative; z-index: 1;
      max-width: 900px;
      margin: 0 auto;
      padding: 0 40px;
    }

    h1 { font-size: 2rem; font-weight: 800; letter-spacing: -0.03em; margin-bottom: 8px; }
    .page-subtitle { color: var(--text-secondary); font-size: 0.9rem; margin-bottom: 40px; }

    h2 {
      font-size: 1.3rem; font-weight: 700; letter-spacing: -0.02em;
      margin: 48px 0 16px;
      padding-bottom: 10px;
      border-bottom: 1px solid var(--border);
    }

    h3 {
      font-size: 1rem; font-weight: 600;
      margin: 28px 0 12px;
    }

    /* ── Endpoint Card ──────────────────────── */
    .endpoint {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 24px;
      margin-bottom: 20px;
    }

    .endpoint-method {
      display: inline-block;
      font-family: 'SF Mono', Menlo, monospace;
      font-size: 0.75rem;
      font-weight: 700;
      padding: 3px 10px;
      border-radius: 6px;
      margin-right: 10px;
    }
    .method-get { background: rgba(34,197,94,0.15); color: var(--green); }

    .endpoint-path {
      font-family: 'SF Mono', Menlo, monospace;
      font-size: 0.85rem;
      color: var(--text-primary);
    }

    .endpoint-desc {
      color: var(--text-secondary);
      font-size: 0.82rem;
      margin-top: 12px;
      line-height: 1.5;
    }

    /* ── Params Table ───────────────────────── */
    .params-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 16px;
      font-size: 0.82rem;
    }
    .params-table th {
      text-align: left;
      color: var(--text-muted);
      font-weight: 600;
      font-size: 0.72rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      padding: 8px 12px;
      border-bottom: 1px solid var(--border);
    }
    .params-table td {
      padding: 10px 12px;
      border-bottom: 1px solid var(--border);
      vertical-align: top;
    }
    .params-table tr:last-child td { border-bottom: none; }
    .param-name {
      font-family: 'SF Mono', Menlo, monospace;
      font-size: 0.78rem;
      color: #c084fc;
    }
    .param-required {
      font-size: 0.65rem;
      text-transform: uppercase;
      font-weight: 700;
      color: var(--orange);
      margin-left: 6px;
    }
    .param-type {
      font-family: 'SF Mono', Menlo, monospace;
      font-size: 0.72rem;
      color: var(--text-muted);
    }

    /* ── Code Block ─────────────────────────── */
    .code-block {
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 18px;
      overflow-x: auto;
      font-family: 'SF Mono', 'Fira Code', monospace;
      font-size: 0.75rem;
      line-height: 1.7;
      color: var(--text-secondary);
      margin: 12px 0 20px;
    }
    .code-block .comment { color: var(--text-muted); }
    .code-block .url { color: var(--accent); }
    .code-block .key { color: #c084fc; }
    .code-block .str { color: var(--green); }
    .code-block .num { color: var(--yellow); }

    /* ── Response Fields ────────────────────── */
    .field-list { margin: 12px 0 20px; }
    .field-item {
      display: flex;
      gap: 12px;
      padding: 8px 0;
      border-bottom: 1px solid var(--border);
      font-size: 0.82rem;
    }
    .field-item:last-child { border-bottom: none; }
    .field-name {
      font-family: 'SF Mono', Menlo, monospace;
      font-size: 0.78rem;
      color: #c084fc;
      min-width: 160px;
      flex-shrink: 0;
    }
    .field-desc { color: var(--text-secondary); line-height: 1.5; }

    /* ── Verdict Table ──────────────────────── */
    .verdict-table {
      width: 100%;
      border-collapse: collapse;
      margin: 12px 0 20px;
      font-size: 0.82rem;
    }
    .verdict-table th {
      text-align: left;
      color: var(--text-muted);
      font-weight: 600;
      font-size: 0.72rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      padding: 8px 12px;
      border-bottom: 1px solid var(--border);
    }
    .verdict-table td {
      padding: 10px 12px;
      border-bottom: 1px solid var(--border);
    }
    .verdict-table tr:last-child td { border-bottom: none; }

    /* ── Rate Limit ─────────────────────────── */
    .tier-table {
      width: 100%;
      border-collapse: collapse;
      margin: 12px 0 20px;
      font-size: 0.82rem;
    }
    .tier-table th {
      text-align: left;
      color: var(--text-muted);
      font-weight: 600;
      font-size: 0.72rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      padding: 8px 12px;
      border-bottom: 1px solid var(--border);
    }
    .tier-table td {
      padding: 10px 12px;
      border-bottom: 1px solid var(--border);
    }
    .tier-table tr:last-child td { border-bottom: none; }

    .note-box {
      background: rgba(99,102,241,0.08);
      border: 1px solid rgba(99,102,241,0.2);
      border-radius: 10px;
      padding: 16px 20px;
      font-size: 0.82rem;
      color: var(--text-secondary);
      line-height: 1.5;
      margin: 16px 0;
    }

    .inline-code {
      font-family: 'SF Mono', Menlo, monospace;
      font-size: 0.78rem;
      background: rgba(255,255,255,0.06);
      padding: 2px 6px;
      border-radius: 4px;
    }

    p { color: var(--text-secondary); font-size: 0.85rem; line-height: 1.6; margin-bottom: 12px; }

    @media (max-width: 640px) {
      .container { padding: 0 20px; }
      h1 { font-size: 1.6rem; }
    }
  </style>
</head>
<body>
  <div class="bg-orb bg-orb-1"></div>
  <div class="bg-orb bg-orb-2"></div>

  <div class="container">
    ${navbarHtml}

    <h1>📡 API Reference</h1>
    <p class="page-subtitle">One endpoint, one answer. Check if any open-source project is actively maintained.</p>

    <h2>Base URL</h2>
    <div class="code-block">https://isitalive.dev</div>

    <h2>Authentication</h2>
    <p>Authentication is optional. Include an API key for higher rate limits:</p>
    <div class="code-block"><span class="comment"># Add to any request</span><br>Authorization: Bearer sk_your_api_key</div>

    <h2>Endpoints</h2>

    <h3>Check Project Health</h3>
    <div class="endpoint">
      <span class="endpoint-method method-get">GET</span>
      <span class="endpoint-path">/api/check/{provider}/{owner}/{repo}</span>
      <p class="endpoint-desc">Returns a health score (0–100), verdict, and signal breakdown for any GitHub repository.</p>

      <table class="params-table">
        <tr><th>Parameter</th><th>Type</th><th>Description</th></tr>
        <tr>
          <td><span class="param-name">provider</span><span class="param-required">required</span></td>
          <td><span class="param-type">string</span></td>
          <td>Source code hosting provider. Currently: <span class="inline-code">github</span></td>
        </tr>
        <tr>
          <td><span class="param-name">owner</span><span class="param-required">required</span></td>
          <td><span class="param-type">string</span></td>
          <td>Repository owner or organization (e.g. <span class="inline-code">vercel</span>)</td>
        </tr>
        <tr>
          <td><span class="param-name">repo</span><span class="param-required">required</span></td>
          <td><span class="param-type">string</span></td>
          <td>Repository name (e.g. <span class="inline-code">next.js</span>)</td>
        </tr>
      </table>
    </div>

    <h3>Example Request</h3>
    <div class="code-block"><span class="comment"># Check a project's health</span><br>curl https://isitalive.dev/api/check/github/vercel/next.js</div>

    <h3>Example Response</h3>
    <div class="code-block">{<br>
&nbsp;&nbsp;<span class="key">"project"</span>: <span class="str">"github/vercel/next.js"</span>,<br>
&nbsp;&nbsp;<span class="key">"provider"</span>: <span class="str">"github"</span>,<br>
&nbsp;&nbsp;<span class="key">"score"</span>: <span class="num">92</span>,<br>
&nbsp;&nbsp;<span class="key">"verdict"</span>: <span class="str">"healthy"</span>,<br>
&nbsp;&nbsp;<span class="key">"checkedAt"</span>: <span class="str">"2026-03-20T10:00:00Z"</span>,<br>
&nbsp;&nbsp;<span class="key">"cached"</span>: <span class="num">true</span>,<br>
&nbsp;&nbsp;<span class="key">"signals"</span>: [<br>
&nbsp;&nbsp;&nbsp;&nbsp;{<br>
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span class="key">"name"</span>: <span class="str">"last_commit"</span>,<br>
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span class="key">"label"</span>: <span class="str">"Last Commit"</span>,<br>
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span class="key">"value"</span>: <span class="str">"2026-03-20T09:30:00Z"</span>,<br>
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span class="key">"score"</span>: <span class="num">100</span>,<br>
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span class="key">"weight"</span>: <span class="num">0.25</span><br>
&nbsp;&nbsp;&nbsp;&nbsp;}<br>
&nbsp;&nbsp;],<br>
&nbsp;&nbsp;<span class="key">"cache"</span>: {<br>
&nbsp;&nbsp;&nbsp;&nbsp;<span class="key">"status"</span>: <span class="str">"hit"</span>,<br>
&nbsp;&nbsp;&nbsp;&nbsp;<span class="key">"tier"</span>: <span class="str">"free"</span>,<br>
&nbsp;&nbsp;&nbsp;&nbsp;<span class="key">"ageSeconds"</span>: <span class="num">3600</span>,<br>
&nbsp;&nbsp;&nbsp;&nbsp;<span class="key">"nextRefreshSeconds"</span>: <span class="num">82800</span><br>
&nbsp;&nbsp;}<br>
}</div>

    <h3>Response Fields</h3>
    <div class="field-list">
      <div class="field-item"><span class="field-name">project</span><span class="field-desc">Fully qualified identifier: <span class="inline-code">provider/owner/repo</span></span></div>
      <div class="field-item"><span class="field-name">score</span><span class="field-desc">Weighted health score from 0 (unmaintained) to 100 (healthy)</span></div>
      <div class="field-item"><span class="field-name">verdict</span><span class="field-desc">Human-readable verdict based on score (see table below)</span></div>
      <div class="field-item"><span class="field-name">checkedAt</span><span class="field-desc">ISO 8601 timestamp of when data was fetched from the provider</span></div>
      <div class="field-item"><span class="field-name">cached</span><span class="field-desc">Whether this result was served from cache</span></div>
      <div class="field-item"><span class="field-name">signals[]</span><span class="field-desc">Individual health signals with name, score (0–100), and weight</span></div>
      <div class="field-item"><span class="field-name">overrideReason</span><span class="field-desc">If present, explains why the score was overridden (e.g. archived repo)</span></div>
      <div class="field-item"><span class="field-name">cache.nextRefreshSeconds</span><span class="field-desc">Seconds until data refreshes — use this to schedule your next poll</span></div>
    </div>

    <h3>Verdicts</h3>
    <table class="verdict-table">
      <tr><th>Score</th><th>Verdict</th><th>Meaning</th></tr>
      <tr><td>80–100</td><td style="color: #22c55e">🟢 healthy</td><td>Actively maintained with strong signals</td></tr>
      <tr><td>60–79</td><td style="color: #eab308">🟡 maintained</td><td>Regular activity, some signals lagging</td></tr>
      <tr><td>40–59</td><td style="color: #f97316">🟠 stale</td><td>Reduced freshness across most signals</td></tr>
      <tr><td>20–39</td><td style="color: #ef4444">🔴 dormant</td><td>Very little recent activity</td></tr>
      <tr><td>0–19</td><td style="color: #6b7280">⚫ unmaintained</td><td>No meaningful activity detected</td></tr>
    </table>

    <h3>Get SVG Badge</h3>
    <div class="endpoint">
      <span class="endpoint-method method-get">GET</span>
      <span class="endpoint-path">/api/badge/{provider}/{owner}/{repo}</span>
      <p class="endpoint-desc">Returns an SVG health badge for README embedding. Cached for 1 hour.</p>
    </div>

    <div class="code-block"><span class="comment"># Markdown</span><br>[![Is It Alive?](https://isitalive.dev/api/badge/github/YOUR_ORG/YOUR_REPO)](https://isitalive.dev/github/YOUR_ORG/YOUR_REPO)<br><br><span class="comment"># HTML</span><br>&lt;a href="https://isitalive.dev/github/YOUR_ORG/YOUR_REPO"&gt;<br>&nbsp;&nbsp;&lt;img src="https://isitalive.dev/api/badge/github/YOUR_ORG/YOUR_REPO" alt="Is It Alive?"&gt;<br>&lt;/a&gt;</div>

    <h2>Rate Limits</h2>
    <p>Rate limits are applied per IP address (unauthenticated) or per API key (authenticated).</p>
    <table class="tier-table">
      <tr><th>Tier</th><th>Rate Limit</th><th>Cache TTL</th></tr>
      <tr><td>No key</td><td>10 req/hr</td><td>24 hours</td></tr>
      <tr><td>Free key</td><td>100 req/hr</td><td>24 hours</td></tr>
      <tr><td>Pro key</td><td>1,000 req/hr</td><td>1 hour</td></tr>
      <tr><td>Enterprise</td><td>10,000 req/hr</td><td>15 min</td></tr>
    </table>

    <div class="note-box">
      Rate limit headers are included with every response:<br>
      <span class="inline-code">X-RateLimit-Limit</span>, <span class="inline-code">X-RateLimit-Remaining</span>, <span class="inline-code">X-RateLimit-Tier</span>
    </div>

    <h2>Error Responses</h2>
    <table class="tier-table">
      <tr><th>Status</th><th>Meaning</th></tr>
      <tr><td>400</td><td>Invalid or unsupported provider</td></tr>
      <tr><td>404</td><td>Repository not found on GitHub</td></tr>
      <tr><td>429</td><td>Rate limit exceeded — check <span class="inline-code">Retry-After</span> header</td></tr>
    </table>

    <h2>Machine-Readable Specs</h2>
    <div class="field-list">
      <div class="field-item"><span class="field-name"><a href="/openapi.json" style="color: var(--accent)">openapi.json</a></span><span class="field-desc">OpenAPI 3.1 specification</span></div>
      <div class="field-item"><span class="field-name"><a href="/llms.txt" style="color: var(--accent)">llms.txt</a></span><span class="field-desc">LLM-friendly API description</span></div>
      <div class="field-item"><span class="field-name"><a href="/.well-known/ai-plugin.json" style="color: var(--accent)">ai-plugin.json</a></span><span class="field-desc">AI agent plugin manifest</span></div>
    </div>

    ${footerHtml}
  </div>

  ${analyticsToken ? '<script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon=\'{"token":"' + analyticsToken + '"}\' ></script>' : ''}
</body>
</html>`;
}
