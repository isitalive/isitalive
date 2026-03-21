# Terms of Service

*Last updated: March 21, 2026*

These terms govern your use of isitalive.dev ("the Service"), operated by the Is It Alive? project. By accessing or using the Service, its API, or its integrations, you agree to be bound by these terms.

## 1\. The Service

Is It Alive? is an infrastructure tool that evaluates the maintenance health and observable security posture of software repositories. We provide:

- A free web-based health checker at **isitalive.dev**
- A public REST API and edge-cached data endpoints
- Embeddable SVG health badges for README files
- AI-generated project summaries and alternative recommendations
- Paid/Sponsored integrations, including API Keys and a GitHub App for CI/CD auditing

## 2\. Acceptable Use & Machine Access

We welcome developers and AI Agents to use the Service. However, you agree not to:

- Circumvent or attempt to bypass rate limits, bot-detection, or Turnstile challenges.
- Use the Service to harass, defame, or artificially manipulate the health status of any project.
- Scrape the Service at scale to train machine learning models, build a competing dataset, or replicate our scoring engine.
- Introduce malicious payloads, attempt injection attacks, or probe for vulnerabilities outside of responsible disclosure.

**Commercial Scraping & Resale:** You may not redistribute our API responses, health scores, or AI insights as part of a standalone commercial SaaS product, or white-label the Service as your own. If you intend to embed our API into a closed-source, proprietary commercial product or paid AI Agent, you must obtain a Commercial License. AI agents consuming our free tier must respect the guidelines in our `/.well-known/llms.txt` file.

## 3\. API Limits, Tokens, & Paid Tiers

Access to the free API is subject to rate limits to ensure infrastructure stability. **Current limits are published in our API documentation and may be dynamically adjusted at any time.** Higher limits, real-time data (`?fresh=true`), and advanced AI insights are available via Paid API keys, Sponsorships, or by providing your own GitHub token.

- **Paid Tiers:** Because API usage involves the immediate consumption of serverless compute and third-party AI/API costs, payments and sponsorships are non-refundable.
- **Revocation:** We reserve the right to throttle, suspend, or revoke access to any API key or IP address that engages in abusive usage patterns, with or without notice.

## 4\. Disclaimer of Warranties (Read Carefully)

The Service is provided **"as is" and "as available"** without warranties of any kind.

Health scores, security flags (via OSV), and AI summaries are **automated assessments** based on public metadata. They reflect observable signals at a point in time and should not be interpreted as endorsements, guarantees of software quality, comprehensive security audits, or professional advice.

> **Important:** A "healthy" score does not guarantee a project is free of bugs, zero-day vulnerabilities, or breaking changes. An "unmaintained" score does not mean a project is unsafe to use — some projects are intentionally feature-complete. Always perform your own due diligence.

> **⚠️ AI-Generated Content & Alternatives:** Premium features utilize Large Language Models (LLMs) to summarize health and suggest alternative packages. **AI models can hallucinate.** We do not guarantee that suggested alternatives are secure, maintained, or even exist. **You are solely responsible for manually verifying the safety of any AI-recommended package before installing it.** Do not configure automated bots to blindly install dependency alternatives based on our API output. The Service assumes zero liability for supply-chain attacks resulting from the adoption of recommended alternatives.

## 5\. Limitation of Liability

To the fullest extent permitted by law, the Is It Alive? project and its contributors shall not be liable for any indirect, incidental, special, consequential, or punitive damages resulting from:

- Your use of or inability to use the Service.
- **Automated Actions:** Supply chain attacks, malware infections, or broken codebases resulting from automated dependency updates or reliance on AI hallucinations.
- Any reliance on health scores, vulnerability flags, or verdicts provided by the Service.
- Unauthorized access to or alteration of your transmissions or data.

## 6\. Data, Privacy, and Private Repositories

We design the Service to collect as little data as possible:

- **Public Scans:** When checking public packages, we query publicly available data. We do not require user accounts and do not collect personally identifiable information (PII). Scores for public queries are cached globally in Cloudflare KV.
- **Private Repositories & BYOT:** If you authenticate the Service using your own private GitHub Personal Access Token or install our GitHub App to scan private corporate code, **we do not read, clone, store, or cache your proprietary source code.** We only analyze metadata (commit timestamps, issue counts, dependency graphs) in volatile memory to calculate the score. Your private code is never used to train AI models.
- **IP Addresses & Analytics:** IP addresses are mathematically hashed for rate limiting; we never store raw IPs. Usage analytics are aggregated and anonymized.

## 7\. Intellectual Property & Licensing

The underlying Is It Alive? scoring engine is open-source software, licensed under the **AGPL-3.0 License** (available on GitHub). You are free to self-host the code under those strict terms.

Access to our managed, hosted API infrastructure at `isitalive.dev` is governed by these Terms. Health scores, verdicts, and SVG badges generated by the Service are public facts and graphics that may be freely embedded, shared, or referenced with attribution.

## 8\. Third-Party Services

The Service relies on third-party infrastructure and APIs:

- **GitHub API** — Subject to GitHub's Terms of Service.
- **OSV.dev** — For open-source vulnerability intelligence.
- **Cloudflare** — For edge compute, caching, AI inference, and bot protection.

We are not responsible for the availability, accuracy, or policies of these third-party services.

## 9\. Service Availability

We strive to keep the Service available, but we do not guarantee uptime SLAs unless explicitly stated in a separate Enterprise contract. The Service may be interrupted for maintenance, updates, or due to circumstances beyond our control.

## 10\. Changes to These Terms

We may update these terms from time to time. Material changes will be noted with an updated "Last updated" date at the top of this page. Continued use of the Service after changes constitutes acceptance of the revised terms.

## 11\. Contact

Questions about these terms, Commercial Licensing, or responsible disclosure? Open an issue on [GitHub](https://github.com/isitalive/isitalive/issues) or reach out through our documented channels.
