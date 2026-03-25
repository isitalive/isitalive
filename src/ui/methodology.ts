// ---------------------------------------------------------------------------
// Methodology page — explains how the health score is calculated
// ---------------------------------------------------------------------------

import { navbarHtml, footerHtml, componentCss, themeCss, themeScript, themeHeadScript } from './components';
import { ogTags } from './og';
import { analyticsScript } from './analytics';

export function methodologyPage(analyticsToken?: string): string {
  return `<!DOCTYPE html>
<html lang="en" data-theme="system">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
  <title>How We Score — Is It Alive?</title>
  <meta name="description" content="Understand how Is It Alive? calculates open-source project health scores. 8 weighted signals, transparent methodology.">
  ${ogTags({
    title: 'How We Score — Is It Alive?',
    description: 'Understand how Is It Alive? calculates open-source project health scores. 8 weighted signals, transparent methodology.',
    url: 'https://isitalive.dev/methodology',
  })}
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="preload" as="style" href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap">
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" media="print" onload="this.media='all'">
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
      line-height: 1.6;
      transition: background 0.3s, color 0.3s;
    }

    .container {
      position: relative;
      z-index: 1;
      max-width: 900px;
      margin: 0 auto;
      padding: 40px 24px 0;
    }

    h1 {
      font-size: 2rem;
      font-weight: 800;
      margin: 0 0 12px;
      letter-spacing: -0.02em;
    }

    .intro {
      color: var(--text-secondary);
      font-size: 0.95rem;
      margin-bottom: 32px;
      max-width: 100%;
    }

    /* ── Weight visualization bar ─────────────────────────────────────── */
    .weight-bar-container {
      margin-bottom: 40px;
    }
    .weight-bar-label {
      font-size: 0.75rem;
      font-weight: 600;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 10px;
    }
    .weight-bar {
      display: flex;
      border-radius: 8px;
      overflow: hidden;
      height: 32px;
      gap: 2px;
    }
    .weight-bar-segment {
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 0.65rem;
      font-weight: 700;
      color: #fff;
      transition: opacity 0.2s;
      cursor: default;
      position: relative;
    }
    .weight-bar-segment:hover { opacity: 0.85; }
    .weight-bar-segment .seg-label {
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      padding: 0 4px;
    }
    .weight-legend {
      display: flex;
      flex-wrap: wrap;
      gap: 12px 20px;
      margin-top: 12px;
      font-size: 0.75rem;
      color: var(--text-secondary);
    }
    .weight-legend-item {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .weight-legend-dot {
      width: 10px;
      height: 10px;
      border-radius: 3px;
      flex-shrink: 0;
    }

    h2 {
      font-size: 1.15rem;
      font-weight: 700;
      margin: 48px 0 20px;
      color: var(--text-primary);
    }

    .signal-card {
      background: transparent;
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 24px 28px;
      margin-bottom: 16px;
      transition: border-color 0.3s;
    }
    .signal-card:hover { border-color: var(--text-muted); }

    .signal-card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
    }

    .signal-card-title {
      font-size: 1rem;
      font-weight: 600;
    }

    .signal-card-weight {
      background: var(--accent);
      color: var(--accent-text);
      padding: 4px 12px;
      border-radius: 4px;
      font-size: 0.75rem;
      font-weight: 700;
    }

    .signal-card p {
      color: var(--text-secondary);
      font-size: 0.85rem;
      margin-bottom: 12px;
    }

    .scoring-table {
      width: 100%;
      font-size: 0.8rem;
      border-collapse: collapse;
    }

    .scoring-table th {
      text-align: left;
      color: var(--text-muted);
      font-weight: 500;
      padding: 6px 0;
      border-bottom: 1px solid var(--border);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      font-size: 0.7rem;
    }

    .scoring-table td {
      padding: 6px 0;
      color: var(--text-secondary);
      border-bottom: 1px solid var(--border);
    }

    .scoring-table td:last-child {
      text-align: right;
      font-weight: 600;
      color: var(--text-primary);
    }

    .verdict-section {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
      gap: 12px;
      margin-top: 16px;
    }

    .verdict-chip {
      background: transparent;
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 16px;
      text-align: center;
    }

    .verdict-chip .emoji { font-size: 1.3rem; margin-bottom: 6px; }
    .verdict-chip .name { font-size: 0.82rem; font-weight: 600; margin-bottom: 2px; }
    .verdict-chip .range { font-size: 0.72rem; color: var(--text-muted); }

    .note-box {
      background: transparent;
      border: 1px solid var(--border);
      border-left: 3px solid var(--accent);
      border-radius: 6px;
      padding: 16px 20px;
      margin: 16px 0;
      font-size: 0.85rem;
      color: var(--text-secondary);
    }
    .note-box strong { color: var(--text-primary); }

    .data-source {
      color: var(--text-muted);
      font-size: 0.75rem;
      font-style: italic;
      margin-top: 4px;
    }

    .example-links {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 12px;
    }
    .example-link {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 14px;
      border: 1px solid var(--border);
      border-radius: 6px;
      font-size: 0.8rem;
      color: var(--text-secondary);
      text-decoration: none;
      transition: border-color 0.2s, color 0.2s;
    }
    .example-link:hover { border-color: var(--accent); color: var(--text-primary); }

    @media (max-width: 640px) {
      h1 { font-size: 1.5rem; }
      .signal-card { padding: 18px; }
      .verdict-section { grid-template-columns: repeat(2, 1fr); }
      .scoring-table { display: block; overflow-x: auto; }
      .note-box { padding: 12px 16px; }
      .weight-bar-segment .seg-label { font-size: 0.55rem; }
    }
  </style>
</head>
<body>

  ${navbarHtml}

  <div class="container">
    <h1>How We Score</h1>
    <p class="intro">Every project is evaluated across 8 weighted signals pulled from the GitHub API. The signals are combined into a single score from 0 to 100, then mapped to a human-readable verdict.</p>

    <!-- Weight visualization bar -->
    <div class="weight-bar-container">
      <div class="weight-bar-label">Signal Weights</div>
      <div class="weight-bar">
        <div class="weight-bar-segment" style="flex: 25; background: #6366f1;" title="Last Commit — 25%"><span class="seg-label">Commit 25%</span></div>
        <div class="weight-bar-segment" style="flex: 15; background: #8b5cf6;" title="Last Release — 15%"><span class="seg-label">Release 15%</span></div>
        <div class="weight-bar-segment" style="flex: 15; background: #a855f7;" title="PR Responsiveness — 15%"><span class="seg-label">PRs 15%</span></div>
        <div class="weight-bar-segment" style="flex: 10; background: #d946ef;" title="Issue Staleness — 10%"><span class="seg-label">Issues 10%</span></div>
        <div class="weight-bar-segment" style="flex: 10; background: #ec4899;" title="Recent Contributors — 10%"><span class="seg-label">Contribs 10%</span></div>
        <div class="weight-bar-segment" style="flex: 10; background: #f43f5e;" title="Bus Factor — 10%"><span class="seg-label">Bus 10%</span></div>
        <div class="weight-bar-segment" style="flex: 10; background: #f97316;" title="CI/CD Activity — 10%"><span class="seg-label">CI/CD 10%</span></div>
        <div class="weight-bar-segment" style="flex: 5; background: #64748b;" title="Stars — 5%"><span class="seg-label">Stars 5%</span></div>
      </div>
      <div class="weight-legend">
        <span class="weight-legend-item"><span class="weight-legend-dot" style="background:#6366f1"></span>Last Commit</span>
        <span class="weight-legend-item"><span class="weight-legend-dot" style="background:#8b5cf6"></span>Last Release</span>
        <span class="weight-legend-item"><span class="weight-legend-dot" style="background:#a855f7"></span>PR Responsiveness</span>
        <span class="weight-legend-item"><span class="weight-legend-dot" style="background:#d946ef"></span>Issue Staleness</span>
        <span class="weight-legend-item"><span class="weight-legend-dot" style="background:#ec4899"></span>Recent Contributors</span>
        <span class="weight-legend-item"><span class="weight-legend-dot" style="background:#f43f5e"></span>Bus Factor</span>
        <span class="weight-legend-item"><span class="weight-legend-dot" style="background:#f97316"></span>CI/CD Activity</span>
        <span class="weight-legend-item"><span class="weight-legend-dot" style="background:#64748b"></span>Stars</span>
      </div>
    </div>

    <h2>Signals</h2>

    <div class="signal-card">
      <div class="signal-card-header">
        <span class="signal-card-title">Last Commit</span>
        <span class="signal-card-weight">25%</span>
      </div>
      <p>How recently the default branch received a commit. This is the strongest indicator that someone is actively working on the project.</p>
      <table class="scoring-table">
        <tr><th>Recency</th><th>Score</th></tr>
        <tr><td>Within 30 days</td><td>100</td></tr>
        <tr><td>Within 90 days</td><td>75</td></tr>
        <tr><td>Within 180 days</td><td>50</td></tr>
        <tr><td>Within 1 year</td><td>25</td></tr>
        <tr><td>Over 1 year ago</td><td>0</td></tr>
      </table>
      <div class="note-box">
        <strong>Stability override:</strong> Projects with no open issues, no open PRs, and 10+ closed issues score 100 even if the last commit was over a year ago. This recognizes "finished" utility packages that are stable, not abandoned.
      </div>
      <p class="data-source">Source: defaultBranchRef.target.history</p>
    </div>

    <div class="signal-card">
      <div class="signal-card-header">
        <span class="signal-card-title">Last Release</span>
        <span class="signal-card-weight">15%</span>
      </div>
      <p>When the most recent release or tag was published. Regular releases indicate a project that ships to users, not just commits to main.</p>
      <table class="scoring-table">
        <tr><th>Recency</th><th>Score</th></tr>
        <tr><td>Within 90 days</td><td>100</td></tr>
        <tr><td>Within 180 days</td><td>75</td></tr>
        <tr><td>Within 1 year</td><td>50</td></tr>
        <tr><td>Over 1 year ago</td><td>0</td></tr>
      </table>
      <p class="data-source">Source: releases(last: 1)</p>
    </div>

    <div class="signal-card">
      <div class="signal-card-header">
        <span class="signal-card-title">PR Responsiveness</span>
        <span class="signal-card-weight">15%</span>
      </div>
      <p>Median age of recently updated pull requests. Fast PR turnaround means the maintainers are engaged and the contribution workflow is healthy.</p>
      <table class="scoring-table">
        <tr><th>Median PR Age</th><th>Score</th></tr>
        <tr><td>Under 7 days</td><td>100</td></tr>
        <tr><td>Under 30 days</td><td>75</td></tr>
        <tr><td>Under 90 days</td><td>50</td></tr>
        <tr><td>Over 90 days</td><td>25</td></tr>
      </table>
      <div class="note-box">
        <strong>Inbox zero:</strong> If there are no open PRs and the project has a history of closed issues, the score is 100 — the maintainers are on top of it. If there are no issues at all, the score defaults to 75.
      </div>
      <p class="data-source">Source: pullRequests(first: 50, orderBy: UPDATED_AT)</p>
    </div>

    <div class="signal-card">
      <div class="signal-card-header">
        <span class="signal-card-title">Issue Staleness</span>
        <span class="signal-card-weight">10%</span>
      </div>
      <p>Median age of the last comment on open issues. Low staleness means maintainers are triaging and responding to bug reports and feature requests.</p>
      <table class="scoring-table">
        <tr><th>Median Comment Age</th><th>Score</th></tr>
        <tr><td>Under 7 days</td><td>100</td></tr>
        <tr><td>Under 30 days</td><td>75</td></tr>
        <tr><td>Under 90 days</td><td>50</td></tr>
        <tr><td>Over 90 days</td><td>25</td></tr>
      </table>
      <div class="note-box">
        <strong>Inbox zero:</strong> No open issues + a history of closed issues = score 100. No issues at all = 75. The system differentiates "inbox zero hero" from "ghost town."
      </div>
      <p class="data-source">Source: issues(first: 50, states: OPEN, orderBy: UPDATED_AT)</p>
    </div>

    <div class="signal-card">
      <div class="signal-card-header">
        <span class="signal-card-title">Recent Contributors</span>
        <span class="signal-card-weight">10%</span>
      </div>
      <p>Number of unique authors who committed in the last 90 days. More contributors means the project isn't dependent on a single person's availability.</p>
      <table class="scoring-table">
        <tr><th>Contributors (90d)</th><th>Score</th></tr>
        <tr><td>6 or more</td><td>100</td></tr>
        <tr><td>2 – 5</td><td>75</td></tr>
        <tr><td>1</td><td>50</td></tr>
        <tr><td>0</td><td>0</td></tr>
      </table>
      <p class="data-source">Source: defaultBranchRef.target.history (since: 90d ago)</p>
    </div>

    <div class="signal-card">
      <div class="signal-card-header">
        <span class="signal-card-title">Bus Factor</span>
        <span class="signal-card-weight">10%</span>
      </div>
      <p>Percentage of commits from the top contributor. If one person wrote 95% of the code, the project is at risk if they step away.</p>
      <table class="scoring-table">
        <tr><th>Top Contributor %</th><th>Score</th></tr>
        <tr><td>Under 50%</td><td>100</td></tr>
        <tr><td>50% – 70%</td><td>75</td></tr>
        <tr><td>70% – 90%</td><td>50</td></tr>
        <tr><td>Over 90%</td><td>25</td></tr>
      </table>
      <div class="note-box">
        <strong>Solo-maintainer forgiveness:</strong> Small projects (under 1,000 stars) with a single dominant contributor score 85 instead of 25. Solo maintainers are normal for small packages — it's only a risk signal for widely-depended-upon projects.
      </div>
      <p class="data-source">Source: Calculated from commit author distribution</p>
    </div>

    <div class="signal-card">
      <div class="signal-card-header">
        <span class="signal-card-title">CI/CD Activity</span>
        <span class="signal-card-weight">10%</span>
      </div>
      <p>Multi-factor assessment of CI/CD health. Checks for workflow file presence, recency of last run, run frequency in the last 30 days, and success rate of recent runs.</p>
      <table class="scoring-table">
        <tr><th>Factor</th><th>Max Points</th></tr>
        <tr><td>Workflows present</td><td>30</td></tr>
        <tr><td>Last run within 7 days</td><td>30</td></tr>
        <tr><td>30+ runs/month</td><td>20</td></tr>
        <tr><td>90%+ success rate</td><td>20</td></tr>
      </table>
      <p class="data-source">Source: object(expression: ".github/workflows") + REST /actions/runs</p>
    </div>

    <div class="signal-card">
      <div class="signal-card-header">
        <span class="signal-card-title">Stars</span>
        <span class="signal-card-weight">5%</span>
      </div>
      <p>GitHub star count as a proxy for community interest. Low weight because stars are a vanity metric — popular ≠ maintained.</p>
      <table class="scoring-table">
        <tr><th>Stars</th><th>Score</th></tr>
        <tr><td>1,000+</td><td>100</td></tr>
        <tr><td>100 – 999</td><td>75</td></tr>
        <tr><td>10 – 99</td><td>50</td></tr>
        <tr><td>Under 10</td><td>25</td></tr>
      </table>
      <p class="data-source">Source: stargazerCount</p>
    </div>

    <h2>Verdicts</h2>
    <p style="color: var(--text-secondary); font-size: 0.85rem; margin-bottom: 16px;">The weighted score maps to one of five verdicts — each describes the <strong>observed state</strong>, not a trajectory:</p>

    <div class="verdict-section">
      <div class="verdict-chip">
        <div class="emoji">🟢</div>
        <div class="name" style="color: #22c55e">Healthy</div>
        <div class="range">80 – 100</div>
      </div>
      <div class="verdict-chip">
        <div class="emoji">🟡</div>
        <div class="name" style="color: #eab308">Stable</div>
        <div class="range">60 – 79</div>
      </div>
      <div class="verdict-chip">
        <div class="emoji">🟠</div>
        <div class="name" style="color: #f97316">Degraded</div>
        <div class="range">40 – 59</div>
      </div>
      <div class="verdict-chip">
        <div class="emoji">🔴</div>
        <div class="name" style="color: #ef4444">Critical</div>
        <div class="range">20 – 39</div>
      </div>
      <div class="verdict-chip">
        <div class="emoji">⚫</div>
        <div class="name" style="color: #6b7280">Unmaintained</div>
        <div class="range">0 – 19</div>
      </div>
    </div>

    <p style="color: var(--text-secondary); font-size: 0.85rem; margin-top: 20px;">See for yourself:</p>
    <div class="example-links">
      <a class="example-link" href="/github/vercel/next.js">🟢 vercel/next.js</a>
      <a class="example-link" href="/github/honojs/hono">🟡 honojs/hono</a>
      <a class="example-link" href="/github/lodash/lodash">🟠 lodash/lodash</a>
    </div>

    <h2>Overrides</h2>
    <div class="note-box">
      <strong>Archived repositories</strong> are automatically scored 0 with the verdict "Unmaintained" regardless of other signals. If the repository owner has explicitly archived it, the project is no longer maintained.
    </div>

    <h2>Caching</h2>
    <p style="color: var(--text-secondary); font-size: 0.85rem;">Results are cached to avoid excessive API calls and to keep responses fast. Cache TTLs depend on your API tier:</p>
    <table class="scoring-table" style="margin-top: 12px; margin-bottom: 40px;">
      <tr><th>Tier</th><th>Fresh TTL</th><th>Stale TTL</th></tr>
      <tr><td>Free (no key)</td><td>24 hours</td><td>48 hours</td></tr>
      <tr><td>Free key</td><td>24 hours</td><td>48 hours</td></tr>
      <tr><td>Pro key</td><td>1 hour</td><td>2 hours</td></tr>
      <tr><td>Enterprise key</td><td>15 minutes</td><td>30 minutes</td></tr>
    </table>

    <p style="color: var(--text-secondary); font-size: 0.85rem; margin-bottom: 8px;">During the <strong>stale</strong> window, you'll receive the cached result immediately while a background refresh runs. After the stale window, a fresh fetch is triggered synchronously.</p>

  </div>

  ${footerHtml}
  ${themeScript}
  ${analyticsScript(analyticsToken)}
</body>
</html>`;
}
