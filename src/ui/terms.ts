// ---------------------------------------------------------------------------
// Terms of Service page — legal terms for using isitalive.dev
// ---------------------------------------------------------------------------

import { navbarHtml, footerHtml, componentCss } from './components';

export function termsPage(analyticsToken?: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Terms of Service — Is It Alive?</title>
  <meta name="description" content="Terms of Service for isitalive.dev — open-source project health checker.">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="preload" as="style" href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap">
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" media="print" onload="this.media='all'">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    ${componentCss}

    :root {
      --bg-primary: #0a0a0f;
      --surface: rgba(255,255,255,0.04);
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
      max-width: 800px;
      margin: 0 auto;
      padding: 0 24px;
    }

    .last-updated {
      color: var(--text-muted);
      font-size: 0.78rem;
      margin-top: 32px;
      letter-spacing: 0.5px;
      text-transform: uppercase;
    }

    h1 {
      font-size: 2rem;
      font-weight: 800;
      margin: 12px 0 12px;
      letter-spacing: -0.02em;
    }

    .intro {
      color: var(--text-secondary);
      font-size: 0.95rem;
      margin-bottom: 40px;
      max-width: 100%;
    }

    h2 {
      font-size: 1.1rem;
      font-weight: 700;
      margin: 40px 0 16px;
      color: var(--text-primary);
    }

    .section-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 24px 28px;
      margin-bottom: 16px;
      transition: border-color 0.3s;
    }
    .section-card:hover { border-color: rgba(255,255,255,0.15); }

    .section-card h3 {
      font-size: 0.95rem;
      font-weight: 600;
      margin-bottom: 10px;
      color: var(--text-primary);
    }

    .section-card p,
    .section-card li {
      color: var(--text-secondary);
      font-size: 0.85rem;
      margin-bottom: 8px;
      line-height: 1.7;
    }

    .section-card ul {
      padding-left: 20px;
      margin-top: 8px;
    }

    .section-card li {
      margin-bottom: 6px;
    }

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

    .contact-link {
      color: var(--accent);
      text-decoration: none;
      transition: opacity 0.2s;
    }
    .contact-link:hover { opacity: 0.8; }

    @media (max-width: 640px) {
      h1 { font-size: 1.5rem; }
      .section-card { padding: 18px; }
    }
  </style>
</head>
<body>
  <div class="bg-orb bg-orb-1"></div>
  <div class="bg-orb bg-orb-2"></div>

  ${navbarHtml}

  <div class="container">
    <p class="last-updated">Last updated: March 21, 2026</p>
    <h1>Terms of Service</h1>
    <p class="intro">These terms govern your use of isitalive.dev ("the Service"), operated by the Is It Alive? project. By accessing or using the Service, you agree to be bound by these terms.</p>

    <h2>1. The Service</h2>
    <div class="section-card">
      <h3>What we provide</h3>
      <p>Is It Alive? is a free, open-source tool that evaluates the maintenance health of public GitHub repositories. We provide:</p>
      <ul>
        <li>A web-based health checker at <strong>isitalive.dev</strong></li>
        <li>A public REST API for programmatic access</li>
        <li>Embeddable SVG health badges for README files</li>
        <li>A GitHub App that audits PR dependencies</li>
        <li>Manifest audit endpoints for batch dependency checks</li>
      </ul>
    </div>

    <h2>2. Acceptable Use</h2>
    <div class="section-card">
      <h3>You agree not to:</h3>
      <ul>
        <li>Circumvent or attempt to bypass rate limits, bot-detection, or Turnstile challenges</li>
        <li>Use the Service to harass, defame, or misrepresent the health status of any project or its maintainers</li>
        <li>Scrape the Service at scale beyond the documented API endpoints</li>
        <li>Redistribute health scores as your own product or white-label the Service without attribution</li>
        <li>Introduce malicious payloads, attempt injection attacks, or probe for vulnerabilities outside of responsible disclosure</li>
        <li>Use the Service in any way that violates applicable laws or regulations</li>
      </ul>
    </div>

    <h2>3. API &amp; Rate Limits</h2>
    <div class="section-card">
      <p>Access to the API is subject to rate limits. Current default limits are <strong>60 requests per minute</strong> for anonymous users. Higher limits are available with an API key.</p>
      <p>We reserve the right to throttle, suspend, or revoke access to any API key or IP address that engages in abusive or excessive usage patterns, with or without notice.</p>
    </div>

    <h2>4. Disclaimer of Warranties</h2>
    <div class="section-card">
      <h3>Provided "as is"</h3>
      <p>The Service is provided <strong>"as is" and "as available"</strong> without warranties of any kind, either express or implied, including but not limited to warranties of merchantability, fitness for a particular purpose, or non-infringement.</p>
      <p>Health scores are <strong>automated assessments</strong> based on publicly available data from the GitHub API. They reflect observable signals at a point in time and should not be interpreted as endorsements, guarantees of software quality, security audits, or professional advice.</p>
    </div>

    <div class="note-box">
      <strong>Important:</strong> A "healthy" score does not guarantee a project is free of bugs, vulnerabilities, or breaking changes. An "unmaintained" score does not mean a project is unsafe to use — some projects are intentionally feature-complete. Always perform your own due diligence before adopting or depending on any software.
    </div>

    <h2>5. Limitation of Liability</h2>
    <div class="section-card">
      <p>To the fullest extent permitted by law, the Is It Alive? project and its contributors shall not be liable for any indirect, incidental, special, consequential, or punitive damages, or any loss of profits or revenues, whether incurred directly or indirectly, or any loss of data, use, goodwill, or other intangible losses resulting from:</p>
      <ul>
        <li>Your use of or inability to use the Service</li>
        <li>Any reliance on health scores or verdicts provided by the Service</li>
        <li>Unauthorized access to or alteration of your transmissions or data</li>
        <li>Any interruption or cessation of the Service</li>
      </ul>
    </div>

    <h2>6. Data &amp; Privacy</h2>
    <div class="section-card">
      <h3>What we collect</h3>
      <p>The Service queries <strong>publicly available data</strong> from the GitHub API. We do not require user accounts and we do not collect or store personally identifiable information (PII).</p>
      <ul>
        <li><strong>IP addresses are hashed</strong> — we never store raw IPs. Hashed values are used solely for rate limiting and abuse prevention.</li>
        <li><strong>Scores are cached</strong> in Cloudflare KV to reduce API calls and improve performance. Cache TTLs vary by tier (see <a href="/methodology" class="contact-link">Methodology</a>).</li>
        <li><strong>Usage analytics</strong> (check counts, trending data) are aggregated and anonymized. No personally identifiable information is stored in analytics.</li>
        <li><strong>Cloudflare Web Analytics</strong> may be used for basic page-view tracking. This is privacy-respecting and does not use cookies.</li>
      </ul>
    </div>

    <h2>7. Intellectual Property</h2>
    <div class="section-card">
      <p>The Is It Alive? project is open-source software. The source code is available on <a href="https://github.com/isitalive/isitalive" class="contact-link">GitHub</a> under its published license.</p>
      <p>Health scores, verdicts, and badges generated by the Service are not copyrightable and may be freely embedded, shared, or referenced with attribution.</p>
    </div>

    <h2>8. Third-Party Services</h2>
    <div class="section-card">
      <p>The Service relies on third-party infrastructure and APIs:</p>
      <ul>
        <li><strong>GitHub API</strong> — for repository data. Subject to <a href="https://docs.github.com/en/site-policy/github-terms/github-terms-of-service" class="contact-link">GitHub's Terms of Service</a>.</li>
        <li><strong>Cloudflare</strong> — for hosting, caching, and bot protection. Subject to <a href="https://www.cloudflare.com/website-terms/" class="contact-link">Cloudflare's Terms</a>.</li>
      </ul>
      <p>We are not responsible for the availability, accuracy, or policies of these third-party services.</p>
    </div>

    <h2>9. Service Availability</h2>
    <div class="section-card">
      <p>We strive to keep the Service available, but we do not guarantee uptime. The Service may be interrupted for maintenance, updates, or due to circumstances beyond our control.</p>
      <p>We reserve the right to modify, suspend, or discontinue the Service (or any part of it) at any time, with or without notice.</p>
    </div>

    <h2>10. Changes to These Terms</h2>
    <div class="section-card">
      <p>We may update these terms from time to time. Material changes will be noted with an updated "Last updated" date at the top of this page. Continued use of the Service after changes constitutes acceptance of the revised terms.</p>
    </div>

    <h2>11. Contact</h2>
    <div class="section-card">
      <p>Questions about these terms? Open an issue on <a href="https://github.com/isitalive/isitalive/issues" class="contact-link">GitHub</a> or reach out through the repository's discussion channels.</p>
    </div>

  </div>

  ${footerHtml}
  ${analyticsToken ? '<script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon=\'{"token":"' + analyticsToken + '"}\'></script>' : ''}
</body>
</html>`;
}
