// ---------------------------------------------------------------------------
// API documentation page — interactive reference for the Is It Alive? API
// ---------------------------------------------------------------------------

import { navbarHtml, footerHtml, componentCss, themeCss, themeScript, themeHeadScript } from './components';
import { ogTags } from './og';
import { analyticsScript } from './analytics';
import { TIERS } from '../cache/index';
import { CACHE_STATUS_DEFINITIONS, METHODOLOGY, SIGNAL_DEFINITIONS, VERDICT_DEFINITIONS } from '../scoring/methodology';

function formatDuration(seconds: number): string {
  if (seconds % 3600 === 0) {
    const hours = seconds / 3600;
    return `${hours} hour${hours === 1 ? '' : 's'}`;
  }

  const minutes = seconds / 60;
  return `${minutes} minute${minutes === 1 ? '' : 's'}`;
}

export function apiDocsPage(analyticsToken?: string): string {
  const verdictColor: Record<string, string> = {
    healthy: '#22c55e',
    stable: '#eab308',
    degraded: '#f97316',
    critical: '#ef4444',
    unmaintained: '#6b7280',
  };

  const verdictIcon: Record<string, string> = {
    healthy: '🟢',
    stable: '🟡',
    degraded: '🟠',
    critical: '🔴',
    unmaintained: '⚫',
  };

  const verdictRows = VERDICT_DEFINITIONS
    .map((verdict) => `<tr><td>${verdict.minScore}–${verdict.maxScore}</td><td style="color: ${verdictColor[verdict.name]}">${verdictIcon[verdict.name]} ${verdict.name}</td><td>${verdict.label} maintenance-health signal</td></tr>`)
    .join('\n');

  const freshnessRows = [
    { label: 'Anonymous', rateLimit: '5 req/min', tier: TIERS.free },
    { label: 'Free API key or GitHub OIDC', rateLimit: '1,000 req/min', tier: TIERS.free },
    { label: 'Pro API key', rateLimit: '1,000 req/min', tier: TIERS.pro },
    { label: 'Enterprise API key', rateLimit: '1,000 req/min', tier: TIERS.enterprise },
  ]
    .map((row) => `<tr><td>${row.label}</td><td>${row.rateLimit}</td><td>${formatDuration(row.tier.freshTtl)}</td><td>${formatDuration(row.tier.staleTtl)}</td><td>${formatDuration(row.tier.l1Ttl)}</td></tr>`)
    .join('\n');

  const cacheStatusRows = CACHE_STATUS_DEFINITIONS
    .map((status) => `<tr><td><span class="inline-code">${status.name}</span></td><td>${status.description}</td></tr>`)
    .join('\n');

  const signalNames = SIGNAL_DEFINITIONS
    .map((signal) => `<span class="inline-code">${signal.name}</span>`)
    .join(', ');

  return `<!DOCTYPE html>
<html lang="en" data-theme="system">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
  <title>API Reference — Is It Alive?</title>
  <meta name="description" content="API documentation for Is It Alive? — inspect maintenance-health scores, evidence, and cache behavior with a single HTTP request.">
  ${ogTags({
    title: 'API Reference — Is It Alive?',
    description: 'API documentation for Is It Alive? — inspect maintenance-health scores, evidence, and cache behavior with a single HTTP request.',
    url: 'https://isitalive.dev/api',
  })}
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap">
  ${themeHeadScript}
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    ${themeCss}
    ${componentCss}

    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      background: var(--bg-primary);
      color: var(--text-primary);
      min-height: 100vh;
      transition: background 0.3s, color 0.3s;
    }

    .container {
      position: relative; z-index: 1;
      max-width: 900px;
      margin: 0 auto;
      padding: 40px 24px 0;
    }

    h1 { font-size: 2rem; font-weight: 800; letter-spacing: -0.03em; margin: 0 0 8px; }
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
      background: transparent;
      border: 1px solid var(--border);
      border-radius: 6px;
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
      color: var(--accent);
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
      background: transparent;
      border: 1px solid var(--border);
      border-radius: 4px;
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
    .code-block .key { color: var(--accent); }
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
      color: var(--accent);
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
      background: transparent;
      border: 1px solid var(--border);
      border-left: 3px solid var(--accent);
      border-radius: 4px;
      padding: 16px 20px;
      font-size: 0.82rem;
      color: var(--text-secondary);
      line-height: 1.5;
      margin: 16px 0;
    }

    .inline-code {
      font-family: 'SF Mono', Menlo, monospace;
      font-size: 0.78rem;
      background: transparent;
      padding: 2px 6px;
      border-radius: 4px;
    }

    p { color: var(--text-secondary); font-size: 0.85rem; line-height: 1.6; margin-bottom: 12px; }

    @media (max-width: 640px) {
      .container { padding: 0 20px; }
      h1 { font-size: 1.6rem; }
      .endpoint { padding: 16px; }
      .field-item { flex-direction: column; gap: 4px; }
      .field-name { min-width: unset; }
      .params-table, .verdict-table, .tier-table { display: block; overflow-x: auto; }
      .code-block { font-size: 0.68rem; padding: 14px; }
    }
  </style>
</head>
<body>

  ${navbarHtml}

  <div class="container">
    <h1>📡 API Reference</h1>
    <p class="page-subtitle">Inspect the maintenance-health of any open-source project, with methodology metadata and agent-readable evidence.</p>

    <h2>Base URL</h2>
    <div class="code-block">https://isitalive.dev</div>

    <h2>Authentication</h2>
    <p>Authentication is optional for health checks and badges. It is <strong>required</strong> for the manifest audit endpoint. Use an API key for all repos, or GitHub Actions OIDC for public-repo audits:</p>
    <div class="code-block"><span class="comment"># Add to any request</span><br>Authorization: Bearer sk_your_api_key</div>

    <h2>Endpoints</h2>

    <h3>Check Project Health</h3>
    <div class="endpoint">
      <span class="endpoint-method method-get">GET</span>
      <span class="endpoint-path">/api/check/{provider}/{owner}/{repo}</span>
      <p class="endpoint-desc">Returns a 0-100 maintenance-health score, verdict, methodology metadata, top drivers, and signal evidence for any GitHub repository. Add <span class="inline-code">?include=metrics</span> when you need normalized raw measurements.</p>

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
        <tr>
          <td><span class="param-name">include</span></td>
          <td><span class="param-type">string</span></td>
          <td>Optional. Use <span class="inline-code">metrics</span> to include normalized raw measurements and sampling metadata.</td>
        </tr>
      </table>
    </div>

    <h3>Example Request</h3>
    <div class="code-block"><span class="comment"># Check a project's maintenance-health with metrics</span><br>curl https://isitalive.dev/api/check/github/vercel/next.js?include=metrics</div>

    <h3>Example Response</h3>
    <div class="code-block">{<br>
&nbsp;&nbsp;<span class="key">"project"</span>: <span class="str">"github/vercel/next.js"</span>,<br>
&nbsp;&nbsp;<span class="key">"provider"</span>: <span class="str">"github"</span>,<br>
&nbsp;&nbsp;<span class="key">"score"</span>: <span class="num">92</span>,<br>
&nbsp;&nbsp;<span class="key">"verdict"</span>: <span class="str">"healthy"</span>,<br>
&nbsp;&nbsp;<span class="key">"checkedAt"</span>: <span class="str">"2026-03-20T10:00:00Z"</span>,<br>
&nbsp;&nbsp;<span class="key">"cached"</span>: <span class="num">true</span>,<br>
&nbsp;&nbsp;<span class="key">"methodology"</span>: {<br>
&nbsp;&nbsp;&nbsp;&nbsp;<span class="key">"version"</span>: <span class="str">"${METHODOLOGY.version}"</span>,<br>
&nbsp;&nbsp;&nbsp;&nbsp;<span class="key">"scoreType"</span>: <span class="str">"${METHODOLOGY.scoreType}"</span>,<br>
&nbsp;&nbsp;&nbsp;&nbsp;<span class="key">"url"</span>: <span class="str">"${METHODOLOGY.url}"</span><br>
&nbsp;&nbsp;},<br>
&nbsp;&nbsp;<span class="key">"drivers"</span>: [<br>
&nbsp;&nbsp;&nbsp;&nbsp;{<br>
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span class="key">"signal"</span>: <span class="str">"lastCommit"</span>,<br>
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span class="key">"direction"</span>: <span class="str">"positive"</span>,<br>
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span class="key">"summary"</span>: <span class="str">"The default branch received a recent commit."</span><br>
&nbsp;&nbsp;&nbsp;&nbsp;}<br>
&nbsp;&nbsp;],<br>
&nbsp;&nbsp;<span class="key">"signals"</span>: [<br>
&nbsp;&nbsp;&nbsp;&nbsp;{<br>
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span class="key">"name"</span>: <span class="str">"lastCommit"</span>,<br>
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span class="key">"label"</span>: <span class="str">"Last Commit"</span>,<br>
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span class="key">"value"</span>: <span class="str">"2 days ago"</span>,<br>
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span class="key">"score"</span>: <span class="num">100</span>,<br>
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span class="key">"weight"</span>: <span class="num">0.25</span>,<br>
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span class="key">"measurement"</span>: <span class="str">"direct"</span>,<br>
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span class="key">"source"</span>: <span class="str">"defaultBranchRef.target.history(first: 1)"</span><br>
&nbsp;&nbsp;&nbsp;&nbsp;}<br>
&nbsp;&nbsp;],<br>
&nbsp;&nbsp;<span class="key">"metrics"</span>: {<br>
&nbsp;&nbsp;&nbsp;&nbsp;<span class="key">"lastCommitAgeDays"</span>: <span class="num">2</span>,<br>
&nbsp;&nbsp;&nbsp;&nbsp;<span class="key">"prSampleSize"</span>: <span class="num">20</span>,<br>
&nbsp;&nbsp;&nbsp;&nbsp;<span class="key">"ciDataSource"</span>: <span class="str">"actions-runs"</span><br>
&nbsp;&nbsp;},<br>
&nbsp;&nbsp;<span class="key">"cache"</span>: {<br>
&nbsp;&nbsp;&nbsp;&nbsp;<span class="key">"status"</span>: <span class="str">"l2-hit"</span>,<br>
&nbsp;&nbsp;&nbsp;&nbsp;<span class="key">"tier"</span>: <span class="str">"free"</span>,<br>
&nbsp;&nbsp;&nbsp;&nbsp;<span class="key">"ageSeconds"</span>: <span class="num">3600</span>,<br>
&nbsp;&nbsp;&nbsp;&nbsp;<span class="key">"nextRefreshSeconds"</span>: <span class="num">82800</span><br>
&nbsp;&nbsp;}<br>
}</div>

    <h3>Response Fields</h3>
    <div class="field-list">
      <div class="field-item"><span class="field-name">project</span><span class="field-desc">Fully qualified identifier: <span class="inline-code">provider/owner/repo</span></span></div>
      <div class="field-item"><span class="field-name">score</span><span class="field-desc">Weighted maintenance-health score from 0 (unmaintained) to 100 (healthy)</span></div>
      <div class="field-item"><span class="field-name">verdict</span><span class="field-desc">Human-readable maintenance-health verdict based on score (see table below)</span></div>
      <div class="field-item"><span class="field-name">checkedAt</span><span class="field-desc">ISO 8601 timestamp of when data was fetched from the provider</span></div>
      <div class="field-item"><span class="field-name">cached</span><span class="field-desc">Whether this result was served from cache</span></div>
      <div class="field-item"><span class="field-name">methodology</span><span class="field-desc">Versioned description of the scoring algorithm, including <span class="inline-code">scoreType: "${METHODOLOGY.scoreType}"</span></span></div>
      <div class="field-item"><span class="field-name">drivers[]</span><span class="field-desc">Top positive or negative reasons the score moved, optimized for quick agent reasoning</span></div>
      <div class="field-item"><span class="field-name">signals[]</span><span class="field-desc">Stable camelCase signals with score, weight, measurement type, and provider source. Canonical names: ${signalNames}</span></div>
      <div class="field-item"><span class="field-name">metrics</span><span class="field-desc">Optional normalized raw values and sample sizes, returned when you pass <span class="inline-code">include=metrics</span></span></div>
      <div class="field-item"><span class="field-name">overrideReason</span><span class="field-desc">If present, explains why the score was overridden (e.g. archived repo)</span></div>
      <div class="field-item"><span class="field-name">cache.nextRefreshSeconds</span><span class="field-desc">Seconds until data refreshes — use this to schedule your next poll</span></div>
    </div>

    <h3>Verdicts</h3>
    <table class="verdict-table">
      <tr><th>Score</th><th>Verdict</th><th>Meaning</th></tr>
      ${verdictRows}
    </table>

    <div class="note-box">
      This is a <strong>maintenance-health</strong> score only. It helps humans and AI agents judge maintainer activity and project durability. It is not a security, license, or compliance verdict.
    </div>

    <h3>Audit Dependency Manifest</h3>
    <div class="endpoint">
      <span class="endpoint-method" style="background: rgba(99,102,241,0.15); color: #818cf8;">POST</span>
      <span class="endpoint-path">/api/manifest</span>
      <p class="endpoint-desc">Upload a <span class="inline-code">go.mod</span> or <span class="inline-code">package.json</span> and get a scored maintenance-health report for every dependency. Authentication is required: API key for any repo, or GitHub Actions OIDC for public repos. Add <span class="inline-code">?include=drivers,metrics,signals</span> for richer agent output.</p>
    </div>

    <h3>Request Body</h3>
    <div class="field-list">
      <div class="field-item"><span class="field-name">format</span><span class="field-desc"><span class="inline-code">"go.mod"</span> or <span class="inline-code">"package.json"</span></span></div>
      <div class="field-item"><span class="field-name">content</span><span class="field-desc">Raw manifest file content (max 512KB)</span></div>
    </div>

    <h3>Query Parameters</h3>
    <div class="field-list">
      <div class="field-item"><span class="field-name">include</span><span class="field-desc">Optional comma-separated extras. Supported values: <span class="inline-code">drivers</span>, <span class="inline-code">metrics</span>, <span class="inline-code">signals</span>.</span></div>
    </div>

    <h3>Example Request</h3>
    <div class="code-block"><span class="comment"># Audit a go.mod file with rich agent output</span><br>curl -X POST 'https://isitalive.dev/api/manifest?include=drivers,metrics,signals' \\<br>&nbsp;&nbsp;-H <span class="str">"Authorization: Bearer sk_your_api_key"</span> \\<br>&nbsp;&nbsp;-H <span class="str">"Content-Type: application/json"</span> \\<br>&nbsp;&nbsp;-d <span class="str">'{"format":"go.mod","content":"&lt;go.mod contents&gt;"}'</span></div>

    <h3>Example Response</h3>
    <div class="code-block">{<br>
&nbsp;&nbsp;<span class="key">"auditHash"</span>: <span class="str">"7da0c591f32d..."</span>,<br>
&nbsp;&nbsp;<span class="key">"complete"</span>: <span class="num">true</span>,<br>
&nbsp;&nbsp;<span class="key">"scored"</span>: <span class="num">262</span>,<br>
&nbsp;&nbsp;<span class="key">"total"</span>: <span class="num">262</span>,<br>
&nbsp;&nbsp;<span class="key">"methodology"</span>: { <span class="key">"version"</span>: <span class="str">"${METHODOLOGY.version}"</span>, <span class="key">"scoreType"</span>: <span class="str">"${METHODOLOGY.scoreType}"</span> },<br>
&nbsp;&nbsp;<span class="key">"summary"</span>: { <span class="key">"healthy"</span>: <span class="num">53</span>, <span class="key">"avgScore"</span>: <span class="num">52</span>, ... },<br>
&nbsp;&nbsp;<span class="key">"dependencies"</span>: [<br>
&nbsp;&nbsp;&nbsp;&nbsp;{<br>
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span class="key">"name"</span>: <span class="str">"github.com/zitadel/zitadel"</span>,<br>
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span class="key">"github"</span>: <span class="str">"zitadel/zitadel"</span>,<br>
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span class="key">"resolvedFrom"</span>: <span class="str">"go.mod require"</span>,<br>
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span class="key">"score"</span>: <span class="num">100</span>,<br>
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span class="key">"verdict"</span>: <span class="str">"healthy"</span>,<br>
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span class="key">"checkedAt"</span>: <span class="str">"2026-03-20T10:00:00Z"</span>,<br>
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span class="key">"dev"</span>: <span class="num">false</span>,<br>
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span class="key">"drivers"</span>: [ ... ],<br>
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span class="key">"metrics"</span>: { ... },<br>
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span class="key">"signals"</span>: [ ... ]<br>
&nbsp;&nbsp;&nbsp;&nbsp;}<br>
&nbsp;&nbsp;]<br>
}</div>

    <h3>Audit Response Fields</h3>
    <div class="field-list">
      <div class="field-item"><span class="field-name">auditHash</span><span class="field-desc">SHA-256 of manifest content — also returned as <span class="inline-code">ETag</span> header</span></div>
      <div class="field-item"><span class="field-name">complete</span><span class="field-desc"><span class="inline-code">true</span> if all deps scored. If <span class="inline-code">false</span>, call again after <span class="inline-code">retryAfterMs</span></span></div>
      <div class="field-item"><span class="field-name">retryAfterMs</span><span class="field-desc">Suggested wait in ms before calling again (only when incomplete)</span></div>
      <div class="field-item"><span class="field-name">methodology</span><span class="field-desc">Same versioned scoring metadata returned by <span class="inline-code">/api/check</span></span></div>
      <div class="field-item"><span class="field-name">dependencies[]</span><span class="field-desc">Per-dependency results: name, version, github, score, verdict, dev, unresolvedReason, resolvedFrom, checkedAt, and optional drivers/metrics/signals when requested</span></div>
    </div>

    <div class="note-box">
      <strong>Retry logic:</strong> If <span class="inline-code">complete</span> is <span class="inline-code">false</span>, call the same endpoint again after <span class="inline-code">retryAfterMs</span>. The cache fills progressively — each call is faster.<br><br>
      <strong>Unresolved deps:</strong> Dependencies not on GitHub get <span class="inline-code">verdict: "unresolved"</span> with a reason (e.g. <span class="inline-code">gitlab_not_supported_yet</span>, <span class="inline-code">no_github_repo</span>).
    </div>

    <h3>Get SVG Badge</h3>
    <div class="endpoint">
      <span class="endpoint-method method-get">GET</span>
      <span class="endpoint-path">/api/badge/{provider}/{owner}/{repo}</span>
      <p class="endpoint-desc">Returns an SVG health badge for README embedding. Edge-cached for 24 hours.</p>
    </div>

    <div class="code-block"><span class="comment"># Markdown</span><br>[![Is It Alive?](https://isitalive.dev/api/badge/github/YOUR_ORG/YOUR_REPO)](https://isitalive.dev/github/YOUR_ORG/YOUR_REPO)<br><br><span class="comment"># HTML</span><br>&lt;a href="https://isitalive.dev/github/YOUR_ORG/YOUR_REPO"&gt;<br>&nbsp;&nbsp;&lt;img src="https://isitalive.dev/api/badge/github/YOUR_ORG/YOUR_REPO" alt="Is It Alive?"&gt;<br>&lt;/a&gt;</div>

    <h2>Rate Limits</h2>
    <p>Rate limiting is infrastructure protection only. Freshness and stale windows vary by tier; request limits vary only by authentication state.</p>
    <table class="tier-table">
      <tr><th>Access</th><th>Rate Limit</th><th>Fresh Window</th><th>Stale Window</th><th>L1 Cache TTL</th></tr>
      ${freshnessRows}
    </table>

    <div class="note-box">
      Rate limit headers are included with every response:<br>
      <span class="inline-code">X-RateLimit-Limit</span>, <span class="inline-code">X-RateLimit-Tier</span>
    </div>

    <h3>Cache Statuses</h3>
    <table class="tier-table">
      <tr><th>Status</th><th>Meaning</th></tr>
      ${cacheStatusRows}
    </table>

    <h2>Error Responses</h2>
    <table class="tier-table">
      <tr><th>Status</th><th>Meaning</th></tr>
      <tr><td>400</td><td>Invalid or unsupported provider</td></tr>
      <tr><td>401</td><td>Authentication required (manifest audit endpoint)</td></tr>
      <tr><td>404</td><td>Repository not found on GitHub</td></tr>
      <tr><td>429</td><td>Rate limit exceeded — check <span class="inline-code">Retry-After</span> header</td></tr>
    </table>

    <h2>Machine-Readable Specs</h2>
    <div class="field-list">
      <div class="field-item"><span class="field-name"><a href="/openapi.json" style="color: var(--accent)">openapi.json</a></span><span class="field-desc">OpenAPI 3.1 specification</span></div>
      <div class="field-item"><span class="field-name"><a href="/llms.txt" style="color: var(--accent)">llms.txt</a></span><span class="field-desc">LLM-friendly API description</span></div>
      <div class="field-item"><span class="field-name"><a href="/.well-known/ai-plugin.json" style="color: var(--accent)">ai-plugin.json</a></span><span class="field-desc">AI agent plugin manifest</span></div>
    </div>

  </div>

  ${footerHtml}

  ${themeScript}
  ${analyticsScript(analyticsToken)}
</body>
</html>`;
}
