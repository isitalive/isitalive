# ADR-007: Go-to-Market & Billing

**Status**: Accepted
**Date**: 2026-03-23
**Authors**: @fforootd
**Related**: ADR-002 (tier table), ADR-004 (quota accounting), ADR-006 (cost model)

## Context

ADRs 002, 004, and 006 established the **what** of pricing — hybrid tiers selling private repos as the product, scored-dep budgets as invisible safety nets, and $19/$49/$99 price points. This ADR captures the **how** — billing infrastructure, sales channels, CI behavior on quota exhaustion, and the margin math proving the model's viability.

The design philosophy is inspired by [HIBP (Have I Been Pwned)](https://haveibeenpwned.com/): a public-good tool that charges for scale and depth, not for the atomic unit. The service feels free for individuals and OSS, with a natural upgrade path for companies with private repos.

## Decisions

### 1. Billing Infrastructure — Stripe Ecosystem

As a bootstrapped, globally-available service, handling VAT/Sales Tax across 40+ jurisdictions is untenable. Stripe's ecosystem now offers two paths to solve this:

#### Option A: Stripe Managed Payments (MoR) — Recommended

[Stripe acquired LemonSqueezy](https://www.lemonsqueezy.com/blog/stripe-acquires-lemon-squeezy) in 2024. The LemonSqueezy team is now building **[Stripe Managed Payments](https://docs.stripe.com/payments/managed-payments)** — a Merchant of Record solution at Stripe scale. It handles global payments, tax compliance, fraud protection, disputes, and customer support across 75 countries and 35 product categories.

This is the spiritual successor to LemonSqueezy: same team, same "easy-peasy" approach, backed by Stripe's infrastructure and authorization rate optimizations.

#### Option B: Stripe + Stripe Tax (Direct)

[Stripe Tax](https://stripe.com/tax) automates sales tax, VAT, and GST calculation, collection, and filing across 100+ countries. You remain the merchant of record, but Stripe handles the tax compliance burden. Filing is handled via integrated filing partners.

#### Decision Matrix

| Concern | Stripe Managed Payments (MoR) | Stripe + Stripe Tax (Direct) |
|---------|-------------------------------|------------------------------|
| Tax compliance | Fully handled — Stripe is the seller | Automated calc + filing via partners |
| Merchant of record | Stripe | You |
| Invoice/receipts | Auto-generated, localized | Stripe Billing auto-generates |
| Fee | ~5%+ (MoR premium) | ~2.9% + $0.30 + Tax fees |
| Disputes/chargebacks | Stripe handles | You handle |
| Availability | Expanding — [35+ merchant countries](https://docs.stripe.com/payments/managed-payments#supported-business-locations), public access coming soon | Generally available |
| Effort | Near-zero | Low (Stripe Tax does the heavy lifting) |

**Decision**: Start with **Stripe Managed Payments** if available in our jurisdiction (public access expected soon per [2026 update](https://www.lemonsqueezy.com/blog/2026-update)). Fall back to **Stripe + Stripe Tax** if Managed Payments isn't available yet — it's lower total fees and still automates the tax burden. Either way, we stay in the Stripe ecosystem.

> [!NOTE]
> LemonSqueezy still operates as a separate product but is migrating users to Stripe Managed Payments. New projects should evaluate Managed Payments first, with legacy LemonSqueezy as a fallback only if needed.

#### Checkout Flow (Self-Serve Tiers)

```text
isitalive.dev/pricing → Stripe Checkout → webhook → Worker
    │
    ▼
Worker receives `checkout.session.completed` webhook
    → Generate API key (sk_...)
    → Write to KEYS_KV: { tier, limits, created, stripe_subscription_id }
    → Email key to customer
```

#### Enterprise Invoicing (Custom Tiers)

For "contact us" Enterprise customers who prefer ACH/wire over self-serve checkout, [Mercury Invoicing](https://mercury.com/invoicing) provides recurring invoicing with auto-reconciliation against the operating bank account. Mercury processes card payments via Stripe under the hood, and offers an [invoicing API](https://docs.mercury.com/reference/accounts_receivable) for programmatic billing.

> [!NOTE]
> Mercury Invoicing does not handle tax compliance — use it only for Enterprise customers where tax obligations are handled contractually (B2B, tax-exempt entities). Self-serve tiers (Starter/Pro/Business) should always go through Stripe Managed Payments or Stripe + Stripe Tax.

### 2. GitHub Sponsors Channel

Developers prefer "sponsoring OSS" over "buying SaaS." GitHub Sponsors provides an alternative billing channel that aligns with the open-source ethos.

```text
github.com/sponsors/isitalive → $19/mo tier
    │
    ▼
GitHub Sponsor webhook → Cloudflare Worker
    → Generate API key in KEYS_KV
    → Tag as source: "sponsor"
    → Email key to sponsor
```

Sponsor tiers map 1:1 to product tiers:

| GitHub Sponsors tier | Product tier | Price |
|---------------------|--------------|-------|
| Silver | Starter | $19/mo |
| Gold | Pro | $49/mo |
| Platinum | Business | $99/mo |

> [!NOTE]
> GitHub Sponsors doesn't handle tax compliance — the sponsorship is treated as a donation/support payment. This is acceptable for individual developers. Corporate customers should use Stripe Checkout for proper invoicing.

### 3. Fail-Open CI Behavior

When a GitHub Action audit exhausts the scored-dep budget, the CI pipeline **must not break**. This is a core product principle.

#### Behavior

The API returns `429` with a structured response:

```json
{
  "error": "Quota exceeded",
  "used": 10000,
  "limit": 10000,
  "period": "2026-03",
  "hint": "Dependency audit skipped. Upgrade at https://isitalive.dev/pricing"
}
```

The `isitalive/audit-action` interprets `429` as a soft failure:

```
⚠️ IsItAlive quota exceeded (10,000/10,000 scored deps this month).
   Dependency audit skipped — build continues.
   Upgrade: https://isitalive.dev/pricing
```

- **Exit code**: `0` (build stays green)
- **PR comment**: Updated with warning banner, previous results preserved
- **GitHub Check**: Neutral status (yellow), not failure (red)

#### Why Fail Open

1. **Trust**: Breaking a customer's CI pipeline is an unrecoverable trust violation. They will uninstall and never return.
2. **Upsell**: The warning creates a low-friction conversation. Engineering managers see the warning in PR comments and upgrade proactively.
3. **Abuse protection**: A rogue script triggers the budget and gets warned, but can't consume infinite compute.

> [!IMPORTANT]
> The 429 response includes `hint` with AI-friendly messaging. LLM agents consuming the API relay the upgrade message to their users, turning every rate-limited interaction into indirect marketing.

### 4. Free API Key Tier — Lead Capture

A gated free tier bridges the gap between "anonymous 5/min" and "paid $19/mo":

| | Anonymous (no key) | Free API Key | Starter ($19) |
|---|---|---|---|
| Auth | None | `Bearer sk_free_...` | `Bearer sk_...` |
| Single checks | 5/min (IP) | 1,000/mo, 60/min | 10,000/mo, 60/min |
| Manifest audit | 401 | 401 | Unlimited |
| Private repos | No | No | 5 |
| Signup | None | Email required | Stripe |

**Purpose**: Capture email leads from AI agent builders, CLI tool developers, and integration authors. When 50 free keys come from one organization's email domain, it's a sales signal — email their CTO with a Pro upgrade offer.

#### Key Generation

```text
POST /api/keys/free
  Body: { email: "dev@company.com" }
  → Validate email (no disposable domains)
  → Generate sk_free_... key
  → Write to KEYS_KV: { tier: "free", email, limits: { single: 1000, rate: 60 } }
  → Send API key via email (double opt-in for EU)
```

### 5. Annual Billing

| Tier | Monthly | Annual | Savings |
|------|---------|--------|---------|
| Starter | $19/mo | $190/yr | 2 months free |
| Pro | $49/mo | $490/yr | 2 months free |
| Business | $99/mo | $990/yr | 2 months free |

Annual plans are configured natively in Stripe Billing (price variants per billing interval).

**Benefits**:
- Upfront cash flow to cover Cloudflare bills for the year
- Corporate buyers prefer annual (one receipt for accounting)
- Reduced churn — annual commitment locks in revenue

### 6. Margin Analysis

#### Cost of Goods Sold (COGS) per Tier — Worst Case

Assumes customer **maxes out** scored-dep budget every month.

| | Starter ($19/mo) | Pro ($49/mo) | Business ($99/mo) |
|---|---|---|---|
| Max scored deps | 10,000 | 50,000 | 250,000 |
| Worker invocations | $0.003 | $0.015 | $0.075 |
| Worker CPU (~50ms) | $0.01 | $0.05 | $0.25 |
| KV writes ($5/M) | $0.05 | $0.25 | $1.25 |
| KV reads ($0.50/M) | $0.10 | $0.10 | $0.13 |
| Stripe (~5% MoR or ~3% direct) | $0.95 | $2.45 | $4.95 |
| **Total COGS** | **$1.11** | **$2.87** | **$6.66** |
| **Gross margin** | **94.2%** | **94.1%** | **93.3%** |

> [!NOTE]
> In practice, most customers will be at 20–40% of their scored-dep budget due to cache hits (L1 Cache API + L2 KV). Realistic margins are **95–98%**. The Stripe fee is the dominant cost line, not compute.

#### Cloudflare Base Cost

| Item | Monthly |
|------|---------|
| Workers Paid plan | $5 |
| Domain registration | ~$1 |
| KV (included in Workers Paid) | $0 up to 10M reads, 1M writes |
| **Fixed overhead** | **~$6/mo** |

Break-even at current overhead: **1 Starter customer** ($19 − $1.11 = $17.89 contribution margin > $6 overhead).

## Consequences

### Positive

- **94%+ gross margins** even at worst-case usage, exceeding the 80% target
- **Zero tax compliance burden** via Stripe Managed Payments (MoR) or automated via Stripe Tax
- **Two billing channels** (Stripe + GitHub Sponsors) reaching different buyer personas
- **Free API Key tier captures leads** without giving away expensive manifest audits
- **Fail-Open CI** preserves trust and creates natural upsell conversations
- **Annual billing** provides upfront cash flow and reduces churn
- **Break-even at 1 customer** — viable from day one

### Negative

- **Stripe Managed Payments** is still expanding — may not be available in all jurisdictions yet (fall back to Stripe + Stripe Tax)
- **GitHub Sponsors** doesn't provide tax-compliant invoices for corporate customers
- **Free API Key** requires building a key signup flow and email delivery
- **Dual billing channel** means two webhook handlers and key provisioning paths
- **Annual plans** complicate refund policy (already non-refundable per TERMS.md)

## Implementation Priority

1. **Stripe checkout + webhook** → key provisioning in KEYS_KV
2. **Free API Key signup** → email → key generation endpoint
3. **Fail-Open in audit-action** → handle 429 as soft failure
4. **GitHub Sponsors webhook** → auto-provision keys
5. **Annual billing** → Stripe subscription variant pricing
6. **Lead capture analytics** → track free key signups by email domain
