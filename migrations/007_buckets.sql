-- Buckets group projects on the dashboard. A project belongs to at most one,
-- which is what "put projects into buckets" asks for — a folder, not a tag.
CREATE TABLE IF NOT EXISTS buckets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- NULL means ungrouped, which is what every existing project starts as.
-- ON DELETE SET NULL: throwing away a bucket is a tidying-up operation, and
-- must never take the projects filed under it with it.
ALTER TABLE projects ADD COLUMN IF NOT EXISTS bucket_id UUID REFERENCES buckets(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_projects_bucket_id ON projects(bucket_id);
