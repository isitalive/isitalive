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
  description_for_human: 'Check the maintenance-health of an open-source project. Get health scores, verdicts, and activity signals for any GitHub repository.',
  description_for_model: 'Use this plugin to check the maintenance-health of an open-source project on GitHub. Call the checkProject endpoint with a provider (github), owner, and repo name to get a maintenance-health score (0-100), verdict (healthy/stable/degraded/critical/unmaintained), methodology metadata, top drivers, and detailed signal breakdown including last commit recency, release recency, issue responsiveness, contributor activity, and more. This score is not a security, license, or compliance verdict. Use include=metrics when you need normalized raw measurements and sampling metadata. Use the badge endpoint to get an embeddable SVG badge. Use the auditManifest endpoint to upload a go.mod or package.json file and get a scored health report for every dependency, with optional include=drivers,metrics,signals for richer agent output.',
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
