-- Initial schema for orqy

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Global settings (e.g., default PAT, encryption key reference, poll interval)
CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Projects to watch and deploy
CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL UNIQUE,
    repo_url TEXT NOT NULL,
    branch TEXT NOT NULL DEFAULT 'staging',
    local_path TEXT NOT NULL,
    compose_file TEXT NOT NULL DEFAULT 'docker-compose.yml',
    service_name TEXT, -- NULL means all services
    pat_encrypted TEXT, -- project-level PAT override (encrypted), NULL = use global
    poll_interval_secs INTEGER NOT NULL DEFAULT 60,
    polling_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    webhook_secret TEXT, -- per-project webhook secret
    auto_deploy BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Deploy history and logs
CREATE TABLE deploys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    trigger_type TEXT NOT NULL CHECK (trigger_type IN ('poll', 'webhook', 'manual')),
    commit_sha TEXT,
    commit_message TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'success', 'failed')),
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at TIMESTAMPTZ,
    duration_secs INTEGER
);

-- Deploy log lines (streamed in real-time)
CREATE TABLE deploy_logs (
    id BIGSERIAL PRIMARY KEY,
    deploy_id UUID NOT NULL REFERENCES deploys(id) ON DELETE CASCADE,
    line_num INTEGER NOT NULL,
    stream TEXT NOT NULL DEFAULT 'stdout' CHECK (stream IN ('stdout', 'stderr', 'system')),
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_deploys_project_id ON deploys(project_id);
CREATE INDEX idx_deploys_started_at ON deploys(started_at DESC);
CREATE INDEX idx_deploy_logs_deploy_id ON deploy_logs(deploy_id);
