-- Normalized client attribution for product/API analytics.
-- Raw User-Agent strings are intentionally not stored; only stable buckets and
-- labels are persisted for aggregate insight.

ALTER TABLE usage_events ADD COLUMN client_family TEXT NOT NULL DEFAULT 'unknown';
ALTER TABLE usage_events ADD COLUMN client_name TEXT NOT NULL DEFAULT 'unknown';
ALTER TABLE usage_events ADD COLUMN client_version TEXT NOT NULL DEFAULT '';
ALTER TABLE usage_events ADD COLUMN client_source TEXT NOT NULL DEFAULT 'default';
ALTER TABLE usage_events ADD COLUMN client_label TEXT NOT NULL DEFAULT 'unknown';

CREATE INDEX IF NOT EXISTS idx_usage_events_timestamp_client_family
  ON usage_events(timestamp, client_family);

CREATE INDEX IF NOT EXISTS idx_usage_events_client_name_timestamp
  ON usage_events(client_name, timestamp);

CREATE INDEX IF NOT EXISTS idx_usage_events_source_timestamp
  ON usage_events(source, timestamp);

CREATE TABLE IF NOT EXISTS daily_client_usage (
  day TEXT NOT NULL,
  client_family TEXT NOT NULL,
  client_name TEXT NOT NULL,
  source TEXT NOT NULL,
  requests INTEGER NOT NULL,
  repos_checked INTEGER NOT NULL,
  avg_response_time_ms REAL NOT NULL,
  last_seen TEXT NOT NULL,
  PRIMARY KEY (day, client_family, client_name, source)
);

CREATE INDEX IF NOT EXISTS idx_daily_client_usage_day
  ON daily_client_usage(day);

CREATE INDEX IF NOT EXISTS idx_daily_client_usage_client_day
  ON daily_client_usage(client_family, client_name, day);
