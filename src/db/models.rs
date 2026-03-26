use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Project {
    pub id: Uuid,
    pub name: String,
    pub repo_url: String,
    pub branch: String,
    pub local_path: String,
    pub compose_file: String,
    pub service_name: Option<String>,
    pub pat_encrypted: Option<String>,
    pub poll_interval_secs: i32,
    pub polling_enabled: bool,
    pub webhook_secret: Option<String>,
    pub auto_deploy: bool,
    pub compose_args: Option<String>,
    pub notify_url: Option<String>,
    pub build_timeout_secs: i32,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
pub struct CreateProject {
    pub name: String,
    pub repo_url: String,
    pub branch: Option<String>,
    pub local_path: String,
    pub compose_file: Option<String>,
    pub service_name: Option<String>,
    pub pat: Option<String>,
    pub poll_interval_secs: Option<i32>,
    pub polling_enabled: Option<bool>,
    pub webhook_secret: Option<String>,
    pub auto_deploy: Option<bool>,
    pub compose_args: Option<String>,
    pub notify_url: Option<String>,
    pub build_timeout_secs: Option<i32>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateProject {
    pub name: Option<String>,
    pub repo_url: Option<String>,
    pub branch: Option<String>,
    pub local_path: Option<String>,
    pub compose_file: Option<String>,
    pub service_name: Option<String>,
    pub pat: Option<String>,
    pub poll_interval_secs: Option<i32>,
    pub polling_enabled: Option<bool>,
    pub webhook_secret: Option<String>,
    pub auto_deploy: Option<bool>,
    pub compose_args: Option<String>,
    pub notify_url: Option<String>,
    pub build_timeout_secs: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Deploy {
    pub id: Uuid,
    pub project_id: Uuid,
    pub trigger_type: String,
    pub commit_sha: Option<String>,
    pub commit_message: Option<String>,
    pub status: String,
    pub started_at: DateTime<Utc>,
    pub finished_at: Option<DateTime<Utc>>,
    pub duration_secs: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct DeployLog {
    pub id: i64,
    pub deploy_id: Uuid,
    pub line_num: i32,
    pub stream: String,
    pub content: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Setting {
    pub key: String,
    pub value: String,
}

/// Lightweight project view for the dashboard (excludes encrypted fields)
#[derive(Debug, Serialize)]
pub struct ProjectSummary {
    pub id: Uuid,
    pub name: String,
    pub repo_url: String,
    pub branch: String,
    pub local_path: String,
    pub compose_file: String,
    pub service_name: Option<String>,
    pub poll_interval_secs: i32,
    pub polling_enabled: bool,
    pub auto_deploy: bool,
    pub has_pat: bool,
    pub has_webhook_secret: bool,
    pub compose_args: Option<String>,
    pub notify_url: Option<String>,
    pub build_timeout_secs: i32,
    pub last_deploy: Option<Deploy>,
}
