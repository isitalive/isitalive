// ---------------------------------------------------------------------------
// Methodology page — explains how the health score is calculated
// ---------------------------------------------------------------------------

export function methodologyPage(analyticsToken?: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>How We Score — Is It Alive?</title>
  <meta name="description" content="Understand how Is It Alive? calculates open-source project health scores. 8 weighted signals, transparent methodology.">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="preload" as="style" href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap">
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" media="print" onload="this.media='all'">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --bg-primary: #0a0a0f;
      --surface: rgba(255,255,255,0.04);
      --surface-hover: rgba(255,255,255,0.08);
      --border: rgba(255,255,255,0.08);
      --text-primary: #e8e8ed;
      --text-secondary: #8b8b9e;
      --text-muted: #55556a;
      --accent: #6366f1;
    }

    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      background: var(--bg-primary);
      color: var(--text-primary);
      min-height: 100vh;
      line-height: 1.6;
    }

    .bg-orb {
      position: fixed;
      border-radius: 50%;
      pointer-events: none;
      z-index: 0;
    }
    .bg-orb-1 { width: 500px; height: 500px; background: radial-gradient(circle, rgba(99,102,241,0.08) 0%, transparent 70%); top: -150px; right: -100px; }
    .bg-orb-2 { width: 400px; height: 400px; background: radial-gradient(circle, rgba(34,197,94,0.08) 0%, transparent 70%); bottom: -150px; left: -100px; }

    .container {
      position: relative;
      z-index: 1;
      max-width: 740px;
      margin: 0 auto;
      padding: 0 24px;
    }

    nav {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 24px 0;
    }
    nav a { color: var(--text-secondary); text-decoration: none; font-size: 0.85rem; font-weight: 500; transition: color 0.2s; }
    nav a:hover { color: var(--text-primary); }
    .nav-logo { font-size: 0.8rem; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; color: var(--accent); }

    h1 {
      font-size: 2rem;
      font-weight: 800;
      margin: 32px 0 12px;
      letter-spacing: -0.02em;
    }

    .intro {
      color: var(--text-secondary);
      font-size: 0.95rem;
      margin-bottom: 40px;
      max-width: 600px;
    }

    h2 {
      font-size: 1.15rem;
      font-weight: 700;
      margin: 48px 0 20px;
      color: var(--text-primary);
    }

    .signal-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 24px 28px;
      margin-bottom: 16px;
      transition: border-color 0.3s;
    }
    .signal-card:hover { border-color: rgba(255,255,255,0.15); }

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
      color: #fff;
      padding: 4px 12px;
      border-radius: 99px;
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
      border-bottom: 1px solid rgba(255,255,255,0.03);
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
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 16px;
      text-align: center;
    }

    .verdict-chip .emoji { font-size: 1.3rem; margin-bottom: 6px; }
    .verdict-chip .name { font-size: 0.82rem; font-weight: 600; margin-bottom: 2px; }
    .verdict-chip .range { font-size: 0.72rem; color: var(--text-muted); }

    .note-box {
      background: rgba(99,102,241,0.08);
      border: 1px solid rgba(99,102,241,0.2);
      border-radius: 12px;
      padding: 16px 20px;
      margin: 24px 0;
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

    footer {
      text-align: center;
      padding: 60px 0 40px;
      color: var(--text-muted);
      font-size: 0.75rem;
    }

    footer a { color: var(--accent); text-decoration: none; }

    @media (max-width: 640px) {
      h1 { font-size: 1.5rem; }
      .signal-card { padding: 18px; }
      .verdict-section { grid-template-columns: repeat(2, 1fr); }
    }
  </style>
</head>
<body>
  <div class="bg-orb bg-orb-1"></div>
  <div class="bg-orb bg-orb-2"></div>

  <div class="container">
    <nav>
      <a href="/" class="nav-logo">Is It Alive</a>
      <a href="/">← Check a project</a>
    </nav>

    <h1>How We Score</h1>
    <p class="intro">Every project is evaluated across 8 weighted signals pulled from the GitHub GraphQL API. The signals are combined into a single score from 0 to 100, then mapped to a human-readable verdict.</p>

    <h2>Signals</h2>

    <div class="signal-card">
      <div class="signal-card-header">
        <span class="signal-card-title">Last Commit</span>
        <span class="signal-card-weight">25%</span>
      </div>
      <p>How recently the default branch received a commit. This is the strongest indicator that someone is actively working on the project.</p>
      <table class="scoring-table">
        <tr><th>Recency</th><th>Score</th></tr>
        <tr><td>Within 7 days</td><td>100</td></tr>
        <tr><td>Within 30 days</td><td>80</td></tr>
        <tr><td>Within 90 days</td><td>60</td></tr>
        <tr><td>Within 180 days</td><td>40</td></tr>
        <tr><td>Within 1 year</td><td>20</td></tr>
        <tr><td>Over 1 year ago</td><td>0</td></tr>
      </table>
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
        <tr><td>Within 30 days</td><td>100</td></tr>
        <tr><td>Within 90 days</td><td>75</td></tr>
        <tr><td>Within 180 days</td><td>50</td></tr>
        <tr><td>Within 1 year</td><td>25</td></tr>
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
        <tr><td>Under 3 days</td><td>100</td></tr>
        <tr><td>Under 7 days</td><td>75</td></tr>
        <tr><td>Under 30 days</td><td>50</td></tr>
        <tr><td>Under 90 days</td><td>25</td></tr>
        <tr><td>Over 90 days</td><td>0</td></tr>
      </table>
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
        <tr><td>Under 180 days</td><td>25</td></tr>
        <tr><td>Over 180 days</td><td>0</td></tr>
      </table>
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
        <tr><td>10 or more</td><td>100</td></tr>
        <tr><td>5 – 9</td><td>75</td></tr>
        <tr><td>2 – 4</td><td>50</td></tr>
        <tr><td>1</td><td>25</td></tr>
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
        <tr><td>70% – 85%</td><td>50</td></tr>
        <tr><td>85% – 95%</td><td>25</td></tr>
        <tr><td>Over 95%</td><td>0</td></tr>
      </table>
      <p class="data-source">Source: Calculated from commit author distribution</p>
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
        <tr><td>500 – 999</td><td>75</td></tr>
        <tr><td>100 – 499</td><td>50</td></tr>
        <tr><td>10 – 99</td><td>25</td></tr>
        <tr><td>Under 10</td><td>0</td></tr>
      </table>
      <p class="data-source">Source: stargazerCount</p>
    </div>

    <div class="signal-card">
      <div class="signal-card-header">
        <span class="signal-card-title">CI/CD Activity</span>
        <span class="signal-card-weight">5%</span>
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

    <h2>Verdicts</h2>
    <p style="color: var(--text-secondary); font-size: 0.85rem; margin-bottom: 16px;">The weighted score maps to one of five verdicts:</p>

    <div class="verdict-section">
      <div class="verdict-chip">
        <div class="emoji">🟢</div>
        <div class="name" style="color: #22c55e">Healthy</div>
        <div class="range">80 – 100</div>
      </div>
      <div class="verdict-chip">
        <div class="emoji">🟡</div>
        <div class="name" style="color: #eab308">Maintained</div>
        <div class="range">60 – 79</div>
      </div>
      <div class="verdict-chip">
        <div class="emoji">🟠</div>
        <div class="name" style="color: #f97316">Declining</div>
        <div class="range">40 – 59</div>
      </div>
      <div class="verdict-chip">
        <div class="emoji">🔴</div>
        <div class="name" style="color: #ef4444">At Risk</div>
        <div class="range">20 – 39</div>
      </div>
      <div class="verdict-chip">
        <div class="emoji">⚫</div>
        <div class="name" style="color: #6b7280">Abandoned</div>
        <div class="range">0 – 19</div>
      </div>
    </div>

    <h2>Overrides</h2>
    <div class="note-box">
      <strong>Archived repositories</strong> are automatically scored 0 with the verdict "Abandoned" regardless of other signals. If the repository owner has explicitly archived it, the project is no longer maintained.
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

    <footer>
      <p><a href="/">← Check a project</a> &nbsp;·&nbsp; <a href="https://github.com/isitaltive/isitalive">Source on GitHub</a></p>
    </footer>
  </div>
  ${analyticsToken ? '<script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon=\'{"token":"' + analyticsToken + '"}\'></script>' : ''}
</body>
</html>`;
}
