use super::models::*;
use sqlx::PgPool;
use uuid::Uuid;

// ── Projects ──

pub async fn list_projects(pool: &PgPool) -> anyhow::Result<Vec<Project>> {
    let projects = sqlx::query_as::<_, Project>("SELECT * FROM projects ORDER BY name")
        .fetch_all(pool)
        .await?;
    Ok(projects)
}

pub async fn get_project(pool: &PgPool, id: Uuid) -> anyhow::Result<Option<Project>> {
    let project = sqlx::query_as::<_, Project>("SELECT * FROM projects WHERE id = $1")
        .bind(id)
        .fetch_optional(pool)
        .await?;
    Ok(project)
}

pub async fn create_project(pool: &PgPool, input: &CreateProject, pat_encrypted: Option<String>) -> anyhow::Result<Project> {
    let project = sqlx::query_as::<_, Project>(
        r#"
        INSERT INTO projects (name, repo_url, branch, local_path, compose_file, service_name,
                              pat_encrypted, poll_interval_secs, polling_enabled, webhook_secret, auto_deploy)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING *
        "#,
    )
    .bind(&input.name)
    .bind(&input.repo_url)
    .bind(input.branch.as_deref().unwrap_or("staging"))
    .bind(&input.local_path)
    .bind(input.compose_file.as_deref().unwrap_or("docker-compose.yml"))
    .bind(&input.service_name)
    .bind(&pat_encrypted)
    .bind(input.poll_interval_secs.unwrap_or(60))
    .bind(input.polling_enabled.unwrap_or(true))
    .bind(&input.webhook_secret)
    .bind(input.auto_deploy.unwrap_or(true))
    .fetch_one(pool)
    .await?;
    Ok(project)
}

pub async fn update_project(
    pool: &PgPool,
    id: Uuid,
    input: &UpdateProject,
    pat_encrypted: Option<Option<String>>,
) -> anyhow::Result<Option<Project>> {
    // Build dynamic update — for simplicity, fetch then update all fields
    let existing = match get_project(pool, id).await? {
        Some(p) => p,
        None => return Ok(None),
    };

    let project = sqlx::query_as::<_, Project>(
        r#"
        UPDATE projects SET
            name = $2, repo_url = $3, branch = $4, local_path = $5,
            compose_file = $6, service_name = $7, pat_encrypted = $8,
            poll_interval_secs = $9, polling_enabled = $10, webhook_secret = $11,
            auto_deploy = $12, updated_at = NOW()
        WHERE id = $1
        RETURNING *
        "#,
    )
    .bind(id)
    .bind(input.name.as_deref().unwrap_or(&existing.name))
    .bind(input.repo_url.as_deref().unwrap_or(&existing.repo_url))
    .bind(input.branch.as_deref().unwrap_or(&existing.branch))
    .bind(input.local_path.as_deref().unwrap_or(&existing.local_path))
    .bind(input.compose_file.as_deref().unwrap_or(&existing.compose_file))
    .bind(input.service_name.as_ref().or(existing.service_name.as_ref()))
    .bind(pat_encrypted.unwrap_or(existing.pat_encrypted.clone()))
    .bind(input.poll_interval_secs.unwrap_or(existing.poll_interval_secs))
    .bind(input.polling_enabled.unwrap_or(existing.polling_enabled))
    .bind(input.webhook_secret.as_ref().or(existing.webhook_secret.as_ref()))
    .bind(input.auto_deploy.unwrap_or(existing.auto_deploy))
    .fetch_one(pool)
    .await?;
    Ok(Some(project))
}

pub async fn delete_project(pool: &PgPool, id: Uuid) -> anyhow::Result<bool> {
    let result = sqlx::query("DELETE FROM projects WHERE id = $1")
        .bind(id)
        .execute(pool)
        .await?;
    Ok(result.rows_affected() > 0)
}

// ── Deploys ──

pub async fn create_deploy(pool: &PgPool, project_id: Uuid, trigger_type: &str) -> anyhow::Result<Deploy> {
    let deploy = sqlx::query_as::<_, Deploy>(
        r#"
        INSERT INTO deploys (project_id, trigger_type)
        VALUES ($1, $2)
        RETURNING *
        "#,
    )
    .bind(project_id)
    .bind(trigger_type)
    .fetch_one(pool)
    .await?;
    Ok(deploy)
}

pub async fn update_deploy_status(
    pool: &PgPool,
    deploy_id: Uuid,
    status: &str,
    commit_sha: Option<&str>,
    commit_message: Option<&str>,
) -> anyhow::Result<()> {
    sqlx::query(
        r#"
        UPDATE deploys SET
            status = $2,
            commit_sha = COALESCE($3, commit_sha),
            commit_message = COALESCE($4, commit_message),
            finished_at = CASE WHEN $2 IN ('success', 'failed') THEN NOW() ELSE finished_at END,
            duration_secs = CASE WHEN $2 IN ('success', 'failed')
                THEN EXTRACT(EPOCH FROM (NOW() - started_at))::INTEGER
                ELSE duration_secs END
        WHERE id = $1
        "#,
    )
    .bind(deploy_id)
    .bind(status)
    .bind(commit_sha)
    .bind(commit_message)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn list_deploys(pool: &PgPool, project_id: Uuid, limit: i64) -> anyhow::Result<Vec<Deploy>> {
    let deploys = sqlx::query_as::<_, Deploy>(
        "SELECT * FROM deploys WHERE project_id = $1 ORDER BY started_at DESC LIMIT $2",
    )
    .bind(project_id)
    .bind(limit)
    .fetch_all(pool)
    .await?;
    Ok(deploys)
}

pub async fn get_latest_deploy(pool: &PgPool, project_id: Uuid) -> anyhow::Result<Option<Deploy>> {
    let deploy = sqlx::query_as::<_, Deploy>(
        "SELECT * FROM deploys WHERE project_id = $1 ORDER BY started_at DESC LIMIT 1",
    )
    .bind(project_id)
    .fetch_optional(pool)
    .await?;
    Ok(deploy)
}

// ── Deploy Logs ──

pub async fn append_log(pool: &PgPool, deploy_id: Uuid, line_num: i32, stream: &str, content: &str) -> anyhow::Result<DeployLog> {
    let log = sqlx::query_as::<_, DeployLog>(
        r#"
        INSERT INTO deploy_logs (deploy_id, line_num, stream, content)
        VALUES ($1, $2, $3, $4)
        RETURNING *
        "#,
    )
    .bind(deploy_id)
    .bind(line_num)
    .bind(stream)
    .bind(content)
    .fetch_one(pool)
    .await?;
    Ok(log)
}

pub async fn get_deploy_logs(pool: &PgPool, deploy_id: Uuid) -> anyhow::Result<Vec<DeployLog>> {
    let logs = sqlx::query_as::<_, DeployLog>(
        "SELECT * FROM deploy_logs WHERE deploy_id = $1 ORDER BY line_num",
    )
    .bind(deploy_id)
    .fetch_all(pool)
    .await?;
    Ok(logs)
}

// ── Settings ──

pub async fn get_setting(pool: &PgPool, key: &str) -> anyhow::Result<Option<String>> {
    let row: Option<(String,)> = sqlx::query_as("SELECT value FROM settings WHERE key = $1")
        .bind(key)
        .fetch_optional(pool)
        .await?;
    Ok(row.map(|r| r.0))
}

pub async fn set_setting(pool: &PgPool, key: &str, value: &str) -> anyhow::Result<()> {
    sqlx::query(
        r#"
        INSERT INTO settings (key, value, updated_at)
        VALUES ($1, $2, NOW())
        ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()
        "#,
    )
    .bind(key)
    .bind(value)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn delete_setting(pool: &PgPool, key: &str) -> anyhow::Result<()> {
    sqlx::query("DELETE FROM settings WHERE key = $1")
        .bind(key)
        .execute(pool)
        .await?;
    Ok(())
}
