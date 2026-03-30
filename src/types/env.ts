// ---------------------------------------------------------------------------
// Worker environment types
//
// `Env` is generated from wrangler.toml via `wrangler types` and is the single
// source of truth for Worker bindings, vars, workflows, pipelines, and declared
// secrets. This module stays intentionally thin so app code has one stable
// import path for infrastructure types.
// ---------------------------------------------------------------------------

export type Env = Cloudflare.Env
export type Pipeline = Env['PROVIDER_PIPELINE']

/** Shape of an API key entry in KEYS_KV */
export interface ApiKeyEntry {
  tier: 'free' | 'pro' | 'enterprise';
  name: string;
  active: boolean;
  created?: string;
}
