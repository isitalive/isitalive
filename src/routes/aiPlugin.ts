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
  description_for_human: 'Check whether an open-source dependency still looks maintained. Get maintenance-health scores, verdicts, and activity signals for any GitHub repository.',
  description_for_model: 'Use this plugin before recommending, adding, or auditing an open-source dependency on GitHub. Call checkProject when you know a GitHub owner/repo, resolvePackage when you only know an npm package or Go module name, and checkPackage when you want resolution plus a maintenance-health result in one call. Results include a maintenance-health score (0-100), verdict (healthy/stable/degraded/critical/unmaintained), methodology metadata, top drivers, and detailed signal breakdown including last commit recency, release recency, issue responsiveness, contributor activity, and more. This score is not a security, license, or compliance verdict. Use include=metrics when you need normalized raw measurements and sampling metadata. Use auditManifest to upload go.mod, go.sum, package.json, package-lock.json, pnpm-lock.yaml, or yarn.lock content and get a scored maintenance-health report for every dependency, with optional include=drivers,metrics,signals for richer agent output.',
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
