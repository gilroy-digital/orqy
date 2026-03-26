-- Add compose_args column for extra docker compose arguments
ALTER TABLE projects ADD COLUMN IF NOT EXISTS compose_args TEXT;
