// ---------------------------------------------------------------------------
// /.well-known/ai-plugin.json — AI agent plugin discovery manifest
//
// Originally from OpenAI's ChatGPT plugin spec, now widely adopted by
// agent frameworks for API discovery.
// ---------------------------------------------------------------------------

export const aiPluginManifest = {
  schema_version: 'v1',
  name_for_human: 'Is It Alive?',
  name_for_model: 'is_it_alive',
  description_for_human: 'Check whether an open-source dependency still looks maintained. Get maintenance-health scores, verdicts, and activity signals for npm packages, Go modules, or GitHub repositories.',
  description_for_model: 'Use this plugin before recommending, adding, or auditing an open-source dependency. If you have an npm package or Go module name, call checkPackage first with ecosystem (npm or go) and packageName; it resolves the package to GitHub and returns a maintenance-health score (0-100), verdict (healthy/stable/degraded/critical/unmaintained), methodology metadata, top drivers, and signal breakdown. If you already have a GitHub owner/repo, call checkProject with provider github. For many dependencies, call checkBatch with package descriptors, purls, or GitHub repos and optional policy thresholds. This score is not a security, license, or compliance verdict. Use resolvePackage when you only need package-to-GitHub mapping, include=metrics when you need normalized raw measurements and sampling metadata, the badge endpoint for SVG badges, and auditManifest or auditManifestViaCheck for authenticated package.json, package-lock.json, pnpm-lock.yaml, yarn.lock, go.mod, or go.sum audits with optional include=drivers,metrics,signals.',
  auth: {
    type: 'none',
  },
  api: {
    type: 'openapi',
    url: 'https://isitalive.dev/openapi.json',
  },
  logo_url: 'https://isitalive.dev/logo.png',
  contact_email: 'hi@isitalive.dev',
  legal_info_url: 'https://isitalive.dev/terms',
};
