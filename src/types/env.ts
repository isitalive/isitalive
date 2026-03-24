// ---------------------------------------------------------------------------
// Worker environment bindings and shared infrastructure types
//
// These types describe the Cloudflare Worker bindings (KV, R2, Pipelines,
// Workflows, Secrets) and are used across all modules. Extracted from
// scoring/types.ts so infrastructure concerns don't live inside the
// scoring domain.
// ---------------------------------------------------------------------------

/** Cloudflare Pipeline binding — sends events to an Iceberg table via R2 */
export interface Pipeline {
  send(data: unknown): Promise<void>;
}

export interface Env {
  CACHE_KV: KVNamespace;
  KEYS_KV: KVNamespace;          // API key store — managed via CF dashboard
  WAITLIST_KV: KVNamespace;      // Waitlist email signups — tier interest tracking
  RATE_LIMITER_ANON: RateLimit;   // 10 req/min — infra protection for anonymous
  RATE_LIMITER_AUTH: RateLimit;   // 1000 req/min — infra protection for authenticated
  DATA_BUCKET: R2Bucket;         // R2 bucket for Iceberg tables (R2 Data Catalog)
  GITHUB_TOKEN?: string;

  // GitHub App — set via CF dashboard secrets
  GITHUB_APP_ID?: string;          // GitHub App ID
  GITHUB_PRIVATE_KEY?: string;     // PEM-encoded RSA private key
  GITHUB_WEBHOOK_SECRET?: string;  // Webhook HMAC secret

  // Cloudflare Turnstile — set via CF dashboard secrets
  TURNSTILE_SITE_KEY?: string;   // public, embedded in HTML
  TURNSTILE_SECRET_KEY?: string; // private, used for server-side verification

  // Cloudflare Web Analytics — set via CF dashboard
  CF_ANALYTICS_TOKEN?: string;   // public, embedded in HTML beacon

  // Admin dashboard — set via CF dashboard secrets
  ADMIN_SECRET?: string;         // shared secret for admin session auth
  CF_ACCOUNT_ID?: string;        // Cloudflare account ID (for R2 SQL API)
  CF_R2_SQL_TOKEN?: string;      // read-only scoped token for R2 SQL queries
  CF_R2_WAREHOUSE?: string;      // R2 Data Catalog warehouse name for SQL queries

  // Workflows — durable ingest + refresh pipelines
  INGEST_WORKFLOW: Workflow;
  REFRESH_WORKFLOW: Workflow;


  // Pipelines — event streams → Iceberg tables
  PROVIDER_PIPELINE: Pipeline;   // Raw upstream API data
  RESULT_PIPELINE: Pipeline;     // Computed health scores
  USAGE_PIPELINE: Pipeline;      // Request/access tracking
  MANIFEST_PIPELINE: Pipeline;   // Dependency scanning events
}

/** Shape of an API key entry in KEYS_KV */
export interface ApiKeyEntry {
  tier: 'free' | 'pro' | 'enterprise';
  name: string;
  active: boolean;
  created?: string;
}
