-- D1 operational store for hot analytics, long-term rollups, and app state.

CREATE TABLE IF NOT EXISTS score_cache (
  cache_key TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  owner TEXT NOT NULL,
  repo TEXT NOT NULL,
  result_json TEXT NOT NULL,
  stored_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_score_cache_expires_at ON score_cache(expires_at);

CREATE TABLE IF NOT EXISTS audit_cache (
  cache_key TEXT PRIMARY KEY,
  content_hash TEXT NOT NULL,
  result_json TEXT NOT NULL,
  stored_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_cache_expires_at ON audit_cache(expires_at);

CREATE TABLE IF NOT EXISTS system_cache (
  cache_key TEXT PRIMARY KEY,
  value_text TEXT NOT NULL,
  stored_at INTEGER NOT NULL,
  expires_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_system_cache_expires_at ON system_cache(expires_at);

CREATE TABLE IF NOT EXISTS first_seen (
  provider TEXT NOT NULL,
  owner TEXT NOT NULL,
  repo TEXT NOT NULL,
  first_seen TEXT NOT NULL,
  PRIMARY KEY (provider, owner, repo)
);

CREATE TABLE IF NOT EXISTS recent_queries (
  repo_key TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  repo TEXT NOT NULL,
  score INTEGER NOT NULL,
  verdict TEXT NOT NULL,
  checked_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_recent_queries_updated_at ON recent_queries(updated_at DESC);

CREATE TABLE IF NOT EXISTS api_keys (
  key_id TEXT PRIMARY KEY,
  tier TEXT NOT NULL,
  name TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_api_keys_active ON api_keys(active);

CREATE TABLE IF NOT EXISTS waitlist_signups (
  email_hash TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  tier TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS event_ingest (
  event_id TEXT PRIMARY KEY,
  event_domain TEXT NOT NULL,
  archived_at TEXT NOT NULL,
  aggregated_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_event_ingest_domain ON event_ingest(event_domain);

CREATE TABLE IF NOT EXISTS usage_events (
  id TEXT PRIMARY KEY,
  timestamp TEXT NOT NULL,
  repo TEXT NOT NULL,
  provider TEXT NOT NULL,
  score INTEGER NOT NULL,
  verdict TEXT NOT NULL,
  source TEXT NOT NULL,
  api_key TEXT NOT NULL,
  cache_status TEXT NOT NULL,
  country TEXT NOT NULL,
  user_agent TEXT NOT NULL,
  response_time_ms INTEGER NOT NULL,
  ip_hash TEXT NOT NULL,
  oidc_repository TEXT,
  oidc_owner TEXT,
  data_json TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_usage_events_timestamp ON usage_events(timestamp);
CREATE INDEX IF NOT EXISTS idx_usage_events_repo_timestamp ON usage_events(repo, timestamp);
CREATE INDEX IF NOT EXISTS idx_usage_events_oidc_timestamp ON usage_events(oidc_repository, timestamp);

CREATE TABLE IF NOT EXISTS result_events (
  id TEXT PRIMARY KEY,
  timestamp TEXT NOT NULL,
  project TEXT NOT NULL,
  score INTEGER NOT NULL,
  verdict TEXT NOT NULL,
  source TEXT NOT NULL,
  data_json TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_result_events_timestamp ON result_events(timestamp);
CREATE INDEX IF NOT EXISTS idx_result_events_project_timestamp ON result_events(project, timestamp);

CREATE TABLE IF NOT EXISTS provider_events (
  id TEXT PRIMARY KEY,
  timestamp TEXT NOT NULL,
  provider TEXT NOT NULL,
  owner TEXT NOT NULL,
  repo TEXT NOT NULL,
  archived INTEGER NOT NULL,
  stars INTEGER NOT NULL,
  forks INTEGER NOT NULL,
  data_json TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_provider_events_timestamp ON provider_events(timestamp);
CREATE INDEX IF NOT EXISTS idx_provider_events_project_timestamp ON provider_events(owner, repo, timestamp);

CREATE TABLE IF NOT EXISTS manifest_events (
  id TEXT PRIMARY KEY,
  timestamp TEXT NOT NULL,
  manifest_hash TEXT NOT NULL,
  format TEXT NOT NULL,
  dep_count INTEGER NOT NULL,
  avg_score INTEGER NOT NULL,
  conclusion TEXT NOT NULL,
  trigger TEXT NOT NULL,
  installation_id INTEGER NOT NULL,
  repo TEXT NOT NULL,
  pr_number INTEGER NOT NULL,
  data_json TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_manifest_events_timestamp ON manifest_events(timestamp);
CREATE INDEX IF NOT EXISTS idx_manifest_events_repo_timestamp ON manifest_events(repo, timestamp);

CREATE TABLE IF NOT EXISTS daily_usage_repo (
  day TEXT NOT NULL,
  repo TEXT NOT NULL,
  provider TEXT NOT NULL,
  source TEXT NOT NULL,
  checks INTEGER NOT NULL,
  latest_score INTEGER NOT NULL,
  latest_verdict TEXT NOT NULL,
  last_seen TEXT NOT NULL,
  PRIMARY KEY (day, repo, source)
);

CREATE INDEX IF NOT EXISTS idx_daily_usage_repo_day ON daily_usage_repo(day);
CREATE INDEX IF NOT EXISTS idx_daily_usage_repo_repo_day ON daily_usage_repo(repo, day);

CREATE TABLE IF NOT EXISTS daily_result_scores (
  day TEXT NOT NULL,
  project TEXT NOT NULL,
  score_sum INTEGER NOT NULL,
  score_count INTEGER NOT NULL,
  latest_score INTEGER NOT NULL,
  latest_verdict TEXT NOT NULL,
  last_seen TEXT NOT NULL,
  PRIMARY KEY (day, project)
);

CREATE INDEX IF NOT EXISTS idx_daily_result_scores_project_day ON daily_result_scores(project, day);

CREATE TABLE IF NOT EXISTS daily_provider_stats (
  day TEXT NOT NULL,
  provider TEXT NOT NULL,
  project TEXT NOT NULL,
  fetches INTEGER NOT NULL,
  latest_archived INTEGER NOT NULL,
  latest_stars INTEGER NOT NULL,
  last_seen TEXT NOT NULL,
  PRIMARY KEY (day, provider, project)
);

CREATE TABLE IF NOT EXISTS daily_manifest_stats (
  day TEXT NOT NULL,
  repo TEXT NOT NULL,
  trigger TEXT NOT NULL,
  scans INTEGER NOT NULL,
  dep_count_sum INTEGER NOT NULL,
  score_sum INTEGER NOT NULL,
  score_count INTEGER NOT NULL,
  last_seen TEXT NOT NULL,
  PRIMARY KEY (day, repo, trigger)
);

CREATE INDEX IF NOT EXISTS idx_daily_manifest_stats_day ON daily_manifest_stats(day);

CREATE TABLE IF NOT EXISTS monthly_oidc_usage (
  period TEXT NOT NULL,
  repository TEXT NOT NULL,
  owner TEXT,
  used INTEGER NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (period, repository)
);

CREATE TABLE IF NOT EXISTS archive_batches (
  batch_id TEXT PRIMARY KEY,
  event_domain TEXT NOT NULL,
  r2_key TEXT NOT NULL,
  event_count INTEGER NOT NULL,
  oldest_timestamp TEXT NOT NULL,
  newest_timestamp TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_archive_batches_domain_newest ON archive_batches(event_domain, newest_timestamp);
