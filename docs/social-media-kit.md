# Social Media Kit

Launch copy and positioning for sharing IsItAlive. Everything here follows one rule:
**lead with the curl, stay honest about scope** (maintenance-health, not security).

## Positioning cheat sheet

**One-liner**
> One HTTP call tells you — and your AI coding agent — whether a dependency is still maintained.

**Elevator pitch (30s)**
> Security scanners tell you when a package is dangerous. Nobody tells you when it's dying.
> IsItAlive scores any npm package, Go module, or GitHub repo 0–100 on eight observable
> maintenance signals — last commit, release cadence, PR responsiveness, issue triage,
> contributors, bus factor, CI activity, community. One free API call, no signup, evidence
> included, so both humans and AI agents can check a dependency's pulse before depending on it.

**The category line (vs competitors)**
> Socket and Snyk are security-first. deps.dev and ecosyste.ms are raw data.
> npms.io — the last product that scored maintenance — is itself abandoned.
> IsItAlive is the maintenance-first verdict: transparent signals, one call, free.

**What NOT to claim**
- ❌ "Catches malicious/hallucinated packages" — that's Socket/Aikido territory; we score *abandonment*, which only incidentally correlates.
- ❌ "Security score" — the methodology page and API responses explicitly scope this as maintenance-health.
- ❌ "AI-powered" — the scoring is deterministic rules over GitHub data. That's a *feature* (inspectable, reproducible); say "built for AI agents", never "built with AI".

**Proof points (with sources)**
- ~1 in 5 of npm's most-downloaded packages is deprecated, archived, or repo-less — [Aqua Security](https://www.aquasec.com/blog/deceptive-deprecation-the-truth-about-npm-deprecated-packages/)
- ~61% of npm packages: no release in 12+ months — [Snyk](https://snyk.io/blog/how-much-do-we-really-know-about-how-packages-behave-on-the-npm-registry/)
- Deprecated top-50k packages still pull ~2.1B downloads *per week* — Aqua, same study
- 19.7% of LLM-suggested package names are hallucinated (adjacent problem, cite carefully) — [USENIX Security 2025](https://socket.dev/blog/slopsquatting-how-ai-hallucinations-are-fueling-a-new-class-of-supply-chain-attacks)

**Demo commands (pick one per post)**
```bash
curl -s https://isitalive.dev/api/check/package/npm/react | jq
curl -s https://isitalive.dev/api/check/github/vercel/next.js | jq
```

---

## X / Twitter — single post (variant A, the hook)

> Your AI agent just added 14 packages to your lockfile.
>
> When did a human last check whether any of them are still maintained?
>
> curl isitalive.dev/api/check/package/npm/react
> → { "score": 96, "verdict": "healthy" }
>
> Free, no signup, evidence included. isitalive.dev

## X / Twitter — single post (variant B, the category)

> Security scanners tell you when a dependency is dangerous.
>
> Nobody tells you when it's dying.
>
> IsItAlive scores any npm/Go package or GitHub repo 0–100 on 8 maintenance signals. One curl, no signup:
>
> isitalive.dev

## X / Twitter — thread

**1/**
~1 in 5 of npm's most-downloaded packages is deprecated, archived, or has lost its repo.

And AI agents now add dependencies faster than any human reviews them.

So I built a pulse check: isitalive.dev

**2/**
One call, no signup:

curl isitalive.dev/api/check/package/npm/react

→ score: 96/100, verdict: "healthy", plus the 8 signals behind it: last commit, release cadence, PR responsiveness, issue triage, contributors, bus factor, CI activity, community.

**3/**
It's built for agents, not just humans.

llms.txt, OpenAPI spec, and machine-readable "drivers" explaining *why* the score is what it is — so Claude Code / Codex / Cursor can check a dependency's pulse before adding it, and tell you what they found.

**4/**
In CI it's one line. Public repos need zero config (GitHub OIDC):

```- uses: isitalive/audit-action@v1```

Every PR gets a maintenance audit of the dependencies it touches. Fails soft, never breaks your build on quota.

**5/**
What it's NOT: a security scanner. No CVEs, no malware detection — Socket and friends do that well.

This covers the risk *before* the CVE: the maintainer who quietly left 14 months ago.

Methodology, weights, and blind spots are all public: isitalive.dev/methodology

**6/**
Free to use, no credit card, AGPL open source — you can read the scoring rules or self-host it.

Would love feedback, especially from people wiring dependency checks into agent workflows: isitalive.dev

---

## LinkedIn

> **Your dependency tree is aging faster than you think — and AI is accelerating it.**
>
> Aqua Security found that roughly 1 in 5 of npm's most-downloaded packages is deprecated, archived, or has lost its repository. Meanwhile, AI coding agents add dependencies to codebases faster than any review process catches up.
>
> Security scanners answer "is this package dangerous?" — but nobody answers "is this package dying?" Abandonment is the risk window *before* the CVE: no patches, no maintainer to respond when one lands.
>
> I built IsItAlive to make that question automatable. It scores any npm package, Go module, or GitHub repository 0–100 on eight observable maintenance signals (last commit, release cadence, PR responsiveness, issue triage, contributor activity, bus factor, CI health, community). The evidence ships with every response, so nothing is a black box.
>
> ✅ One free API call, no signup
> ✅ Built for AI agents: llms.txt, OpenAPI, machine-readable rationale
> ✅ One-line GitHub Action — public repos need zero configuration
> ✅ Open source (AGPL), transparent methodology
>
> It deliberately does *not* do security — pair it with your scanner of choice.
>
> Try it: https://isitalive.dev — I'd genuinely value feedback from teams putting guardrails around agent-written code.

---

## Show HN

**Title:**
> Show HN: IsItAlive – check if a dependency is still maintained, in one HTTP call

**Text:**
> Hi HN, I built a small service that answers one question: is this open-source project still alive?
>
> curl -s https://isitalive.dev/api/check/package/npm/react
>
> returns a 0–100 maintenance-health score with the eight signals behind it (last commit, release cadence, PR responsiveness, issue staleness, recent contributors, bus factor, CI activity, stars). Works for npm packages, Go modules, and any public GitHub repo. No signup, free, rate-limited to keep infra costs sane.
>
> Why: security scanners tell you when a package is dangerous, but nothing in my toolchain told me when one was quietly abandoned — and with coding agents adding dependencies faster than I review them, I wanted a check that both humans and agents can call (there's an llms.txt, OpenAPI spec, and machine-readable score rationale for that; plus a zero-config GitHub Action that audits PRs via OIDC).
>
> What it's not: a security/license/compliance tool, and the score is a heuristic — a "finished" utility library isn't dead, so there's a stability override for repos with no open issues and a history of closed ones; solo-maintainer projects under 1k stars aren't penalized on bus factor. All thresholds and weights are public: https://isitalive.dev/methodology
>
> Honest limitations: npm + Go only so far, signals are GitHub-based (monorepo packages inherit the monorepo's score), and manifest/batch endpoints need a hand-issued key while it's free (single checks don't).
>
> Stack: Cloudflare Workers + Hono, D1, KV, Queues, R2; AGPL: https://github.com/isitalive/isitalive
>
> Would love feedback on the scoring model and what ecosystems to add next.

---

## Reddit (r/javascript, r/node, r/golang — adjust ecosystem)

**Title:** I built a free API that tells you if an npm package is still maintained (0–100 score, no signup)

> Security tools flag vulnerabilities, but I kept getting bitten by packages that were quietly abandoned — ~61% of npm packages haven't released in over a year (Snyk's number, not mine).
>
> So I built https://isitalive.dev — you give it a package or repo, it gives you a 0–100 maintenance score plus the evidence: last commit, release cadence, PR responsiveness, issue triage, contributors, bus factor, CI activity.
>
> `curl -s https://isitalive.dev/api/check/package/npm/react | jq`
>
> There's also a badge for READMEs, a one-line GitHub Action for CI, and agent-friendly endpoints (llms.txt/OpenAPI) if you're into letting Claude/Codex vet dependencies before adding them.
>
> It's free, open source (AGPL), and deliberately NOT a security scanner — methodology is public at https://isitalive.dev/methodology. Happy to answer anything about the scoring; roast welcome.

---

## Bluesky / Mastodon (short)

> Security scanners tell you when a dependency is dangerous. Nobody tells you when it's dying.
>
> isitalive.dev — a 0–100 maintenance score for any npm/Go package or GitHub repo. One curl, no signup, open source, and an API your coding agent can call.

---

## Practical notes

- **Link previews**: the landing page and result pages ship a 1200×630 Open Graph card (`/assets/og-card.png`, `summary_large_image`), so bare links render a branded card on X/LinkedIn/Slack/Discord.
- **Best screenshots**: a result page for a well-known *degraded* project is far more shareable than a healthy one — "look what scores 34" starts conversations. Verify the example is genuinely stale before posting.
- **Timing**: Show HN performs best weekday mornings US Eastern; reply fast for the first 2 hours.
- **The badge is the growth loop**: every README that embeds it advertises the service. When someone with a popular repo engages, offer them the badge directly.
