-- Build timeout in seconds (default 600 = 10 minutes)
ALTER TABLE projects ADD COLUMN IF NOT EXISTS build_timeout_secs INTEGER NOT NULL DEFAULT 600;
