// ---------------------------------------------------------------------------
// Pricing page — Free tier + three paid tier waitlist cards
// ---------------------------------------------------------------------------

import { navbarHtml, footerHtml, componentCss, themeCss, themeScript, themeHeadScript } from './components'
import { ogTags } from './og'
import { analyticsScript } from './analytics'

interface PaidTier {
  id: string
  emoji: string
  name: string
  price: string
  annual: string
  features: string[]
}

const paidTiers: PaidTier[] = [
  {
    id: 'starter',
    emoji: '<svg viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
    name: 'Starter',
    price: '$19/mo',
    annual: '$190/yr — 2 months free',
    features: [
      '5 private repos',
      'CI audits for private repos',
      '4h data freshness',
    ],
  },
  {
    id: 'pro',
    emoji: '<svg viewBox="0 0 24 24"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>',
    name: 'Pro',
    price: '$49/mo',
    annual: '$490/yr — 2 months free',
    features: [
      '25 private repos',
      'Lock file checks (transitive deps)',
      '1h data freshness',
    ],
  },
  {
    id: 'business',
    emoji: '<svg viewBox="0 0 24 24"><rect x="4" y="2" width="16" height="20" rx="2" ry="2"/><path d="M9 22v-4h6v4"/><path d="M8 6h.01"/><path d="M16 6h.01"/><path d="M12 6h.01"/><path d="M12 10h.01"/><path d="M12 14h.01"/><path d="M16 10h.01"/><path d="M16 14h.01"/><path d="M8 10h.01"/><path d="M8 14h.01"/></svg>',
    name: 'Business',
    price: '$99/mo',
    annual: '$990/yr — 2 months free',
    features: [
      'Unlimited private repos',
      'In-depth security scans',
      '15min data freshness',
    ],
  },
]

function tierCardHtml(tier: PaidTier): string {
  const features = tier.features.map(f => `<li>${f}</li>`).join('\n        ')
  return `
    <div class="tier-card paid-tier" id="tier-${tier.id}">
      <div class="tier-header">
        <span class="tier-emoji">${tier.emoji}</span>
        <div>
          <div class="tier-name">${tier.name} <span class="tier-price">${tier.price}</span></div>
          <div class="tier-subtitle">${tier.annual}</div>
        </div>
      </div>
      <ul class="tier-features">
        ${features}
      </ul>
      <form class="waitlist-form" data-tier="${tier.id}">
        <div class="waitlist-input-row">
          <input type="email" placeholder="you@company.com" aria-label="Work email" required autocomplete="email" class="waitlist-email" />
          <button type="submit" class="tier-btn tier-btn-primary waitlist-btn">🔔 Join Waitlist</button>
        </div>
        <div class="cf-turnstile-slot"></div>
        <div class="waitlist-status"></div>
      </form>
    </div>`
}

export function pricingPage(turnstileSiteKey?: string, analyticsToken?: string): string {
  const paidCards = paidTiers.map(t => tierCardHtml(t)).join('\n')

  return `<!DOCTYPE html>
<html lang="en" data-theme="system">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
  <title>Pricing — Is It Alive?</title>
  <meta name="description" content="Is It Alive? is free for open source. Check dependency health, get badges, and automate audits in CI — no cost, no limits for public repos.">
  ${ogTags({
    title: 'Pricing — Is It Alive?',
    description: 'Free for open source, forever. Paid tiers coming soon for private repos.',
    url: 'https://isitalive.dev/pricing',
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
      transition: background 0.3s, color 0.3s;
    }

    .container {
      position: relative;
      z-index: 1;
      max-width: 1100px;
      margin: 0 auto;
      padding: 0 24px;
    }

    /* ── Hero ─────────────────────────────── */
    .pricing-hero {
      text-align: center;
      padding: 48px 0 40px;
    }

    .pricing-hero h1 {
      font-size: 2rem;
      font-weight: 800;
      letter-spacing: -0.03em;
      line-height: 1.1;
      margin-bottom: 12px;
    }

    .pricing-hero p {
      font-size: 1rem;
      color: var(--text-secondary);
      line-height: 1.6;
      max-width: 500px;
      margin: 0 auto;
    }

    /* ── Free Tier Card ──────────────────── */
    .tier-card {
      background: transparent;
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 36px;
      margin-bottom: 24px;
      transition: border-color 0.2s;
    }

    .tier-card:hover { border-color: var(--text-muted); }

    .tier-card.featured {
      border-color: var(--green);
      box-shadow: 0 0 0 1px var(--green), 0 4px 24px rgba(34,197,94,0.08);
    }

    .tier-header {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 20px;
    }

    .tier-emoji {
      width: 32px;
      height: 32px;
      flex-shrink: 0;
    }
    .tier-emoji svg {
      width: 100%;
      height: 100%;
      stroke: var(--green);
      fill: none;
      stroke-width: 1.5;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
    .paid-tier .tier-emoji svg { stroke: var(--accent); }
    .tier-name { font-size: 1.2rem; font-weight: 700; }
    .tier-price { font-weight: 400; color: var(--text-secondary); font-size: 1rem; }
    .tier-subtitle { font-size: 0.8rem; color: var(--text-muted); font-weight: 400; }

    .tier-features {
      list-style: none;
      margin-bottom: 24px;
    }

    .tier-features li {
      font-size: 0.9rem;
      color: var(--text-secondary);
      padding: 6px 0;
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .tier-features li::before {
      content: '✓';
      color: var(--green);
      font-weight: 700;
      flex-shrink: 0;
    }

    .tier-actions {
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
    }

    .tier-btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 10px 20px;
      border-radius: 6px;
      font-weight: 600;
      font-size: 0.85rem;
      text-decoration: none;
      transition: all 0.2s;
      border: none;
      cursor: pointer;
    }

    .tier-btn-primary {
      background: var(--accent);
      color: var(--accent-text);
    }
    .tier-btn-primary:hover { background: var(--accent-hover); transform: translateY(-1px); }
    .tier-btn-primary:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }

    .tier-btn-secondary {
      background: transparent;
      color: var(--text-secondary);
      border: 1px solid var(--border);
    }
    .tier-btn-secondary:hover { border-color: var(--text-muted); color: var(--text-primary); }

    /* ── Paid Tier Cards ──────────────────── */
    .paid-tiers-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 20px;
      margin-bottom: 24px;
    }

    .paid-tier {
      border-style: dashed;
      margin-bottom: 0;
    }

    /* Free tier features inline */
    .tier-card.featured .tier-features {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 0 24px;
    }

    /* ── Waitlist Form ────────────────────── */
    .waitlist-input-row {
      display: flex;
      gap: 10px;
    }

    .waitlist-email {
      flex: 1;
      padding: 10px 14px;
      border-radius: 6px;
      border: 1px solid var(--border);
      background: var(--bg-primary);
      color: var(--text-primary);
      font-size: 0.85rem;
      font-family: inherit;
      outline: none;
      transition: border-color 0.2s;
    }
    .waitlist-email:focus { border-color: var(--accent); }
    .waitlist-email::placeholder { color: var(--text-muted); }

    .cf-turnstile-slot {
      margin-top: 12px;
      min-height: 0;
      transition: min-height 0.3s;
    }
    .cf-turnstile-slot:not(:empty) { min-height: 65px; }

    .waitlist-status {
      font-size: 0.8rem;
      margin-top: 8px;
      min-height: 1.2em;
    }
    .waitlist-status.success { color: var(--green); }
    .waitlist-status.error { color: #ef4444; }

    /* ── Sponsors ─────────────────────────── */
    .sponsors-section {
      text-align: center;
      padding: 24px 0 48px;
      color: var(--text-muted);
      font-size: 0.9rem;
    }

    .sponsors-section a {
      color: var(--text-secondary);
      text-decoration: none;
      font-weight: 600;
      transition: color 0.2s;
    }
    .sponsors-section a:hover { color: var(--text-primary); }

    /* ── Responsive ──────────────────────── */
    @media (max-width: 900px) {
      .paid-tiers-grid { grid-template-columns: 1fr; }
      .tier-card.featured .tier-features { grid-template-columns: repeat(2, 1fr); }
    }
    @media (max-width: 640px) {
      .container { padding: 0 16px; }
      .pricing-hero { padding: 32px 0 28px; }
      .pricing-hero h1 { font-size: 1.6rem; }
      .tier-card { padding: 24px; }
      .paid-tier { padding: 24px 20px; }
      .tier-actions { flex-direction: column; }
      .tier-btn { width: 100%; justify-content: center; }
      .waitlist-input-row { flex-direction: column; }
      .waitlist-btn { font-family: inherit; width: 100%; justify-content: center; }
      .tier-card.featured .tier-features { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>

  ${navbarHtml}

  <div class="container">

    <section class="pricing-hero">
      <h1>Know your dependencies are alive.</h1>
      <p>Free for open source, forever. We believe every developer deserves to know the health of their supply chain.</p>
    </section>

    <div class="tier-card featured">
      <div class="tier-header">
        <span class="tier-emoji"><svg viewBox="0 0 24 24"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg></span>
        <div>
          <div class="tier-name">Free</div>
          <div class="tier-subtitle">Open source, forever.</div>
        </div>
      </div>
      <ul class="tier-features">
        <li>Health scores for any public repo</li>
        <li>Dependency audit on every PR</li>
        <li>GitHub Action — zero setup</li>
        <li>Embeddable README badges</li>
        <li>Public REST API</li>
        <li>30-day score history</li>
      </ul>
      <div class="tier-actions">
        <a href="/" class="tier-btn tier-btn-primary">Check a Repo</a>
        <a href="https://github.com/isitalive/audit-action" class="tier-btn tier-btn-secondary" target="_blank" rel="noopener">Install Action</a>
      </div>
    </div>

    <div class="paid-tiers-grid">
    ${paidCards}
    </div>

    <div class="sponsors-section">
      <p>⭐ Like what we're building?</p>
      <a href="https://github.com/isitalive/isitalive" target="_blank" rel="noopener">
        Star us on GitHub →
      </a>
    </div>

  </div>

  ${footerHtml}

  ${turnstileSiteKey ? `<script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" async defer></script>` : ''}
  <script>
  (function() {
    var siteKey = ${turnstileSiteKey ? JSON.stringify(turnstileSiteKey) : 'null'};

    document.querySelectorAll('.waitlist-form').forEach(function(form) {
      var tier = form.getAttribute('data-tier');
      var emailInput = form.querySelector('.waitlist-email');
      var btn = form.querySelector('.waitlist-btn');
      var status = form.querySelector('.waitlist-status');
      var turnstileSlot = form.querySelector('.cf-turnstile-slot');
      var widgetId = null;
      var submitted = false;

      // Render Turnstile widget on email focus (lazy, handles async script load)
      if (siteKey) {
        emailInput.addEventListener('focus', function renderWidget() {
          if (widgetId !== null) return;
          if (window.turnstile) {
            widgetId = turnstile.render(turnstileSlot, { sitekey: siteKey, size: 'normal' });
            emailInput.removeEventListener('focus', renderWidget);
          } else {
            // Script not loaded yet — retry shortly
            var retryCount = 0;
            var interval = setInterval(function() {
              retryCount++;
              if (window.turnstile) {
                clearInterval(interval);
                widgetId = turnstile.render(turnstileSlot, { sitekey: siteKey, size: 'normal' });
              } else if (retryCount > 20) {
                clearInterval(interval); // Give up after ~5s
              }
            }, 250);
          }
        }, { once: true });
      }

      form.addEventListener('submit', function(e) {
        e.preventDefault();
        if (submitted) return;

        var email = emailInput.value.trim();
        if (!email) return;

        var turnstileToken = '';
        if (siteKey && window.turnstile && widgetId !== null) {
          turnstileToken = turnstile.getResponse(widgetId) || '';
          if (!turnstileToken) {
            status.textContent = 'Please complete the verification.';
            status.className = 'waitlist-status error';
            return;
          }
        }

        btn.disabled = true;
        btn.textContent = 'Joining…';
        status.textContent = '';

        fetch('/_data/waitlist', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email, tier: tier, 'cf-turnstile-response': turnstileToken })
        })
        .then(function(r) { return r.json(); })
        .then(function() {
          submitted = true;
          status.textContent = '🎉 Thanks! We\\'ll notify you when ' + tier.charAt(0).toUpperCase() + tier.slice(1) + ' is available.';
          status.className = 'waitlist-status success';
          btn.textContent = '✓ Joined';
          emailInput.disabled = true;
          if (turnstileSlot) turnstileSlot.style.display = 'none';
        })
        .catch(function() {
          status.textContent = 'Something went wrong. Please try again.';
          status.className = 'waitlist-status error';
          btn.disabled = false;
          btn.textContent = '🔔 Join Waitlist';
          if (siteKey && window.turnstile && widgetId !== null) turnstile.reset(widgetId);
        });
      });
    });
  })();
  </script>

  ${themeScript}
  ${analyticsScript(analyticsToken)}
</body>
</html>`
}
