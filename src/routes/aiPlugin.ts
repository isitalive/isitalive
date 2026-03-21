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
  description_for_human: 'Check if an open-source project is actively maintained. Get health scores, verdicts, and activity signals for any GitHub repository.',
  description_for_model: 'Use this plugin to check if an open-source project on GitHub is actively maintained. Call the checkProject endpoint with a provider (github), owner, and repo name to get a health score (0-100), verdict (healthy/stable/degraded/critical/unmaintained), and detailed signal breakdown including last commit recency, release recency, issue responsiveness, contributor activity, and more. The response includes cache metadata with nextRefreshSeconds telling you when to re-poll. Use the badge endpoint to get an embeddable SVG badge. Use the auditManifest endpoint to upload a go.mod or package.json file and get a scored health report for every dependency — synchronous, idempotent, cache-first.',
  auth: {
    type: 'none',
  },
  api: {
    type: 'openapi',
    url: 'https://isitalive.dev/openapi.json',
  },
  logo_url: 'https://isitalive.dev/logo.png',
  contact_email: '',
  legal_info_url: 'https://github.com/isitalive/isitalive/blob/main/LICENSE',
};
