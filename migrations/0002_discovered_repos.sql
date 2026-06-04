-- Repositories discovered from external feeds such as GitHub Trending.
-- These are separate from user/request-tracked repos so the app can keep
-- discovered projects warm after they fall off the external feed.

CREATE TABLE IF NOT EXISTS discovered_repos (
  provider TEXT NOT NULL,
  repo TEXT NOT NULL,
  source TEXT NOT NULL,
  first_discovered TEXT NOT NULL,
  last_discovered TEXT NOT NULL,
  last_refreshed TEXT,
  refresh_count INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (provider, repo)
);

CREATE INDEX IF NOT EXISTS idx_discovered_repos_active_last_discovered
  ON discovered_repos(active, last_discovered DESC);

CREATE INDEX IF NOT EXISTS idx_discovered_repos_last_refreshed
  ON discovered_repos(last_refreshed);
