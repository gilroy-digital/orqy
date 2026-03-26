use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use serde::Deserialize;
use uuid::Uuid;

use crate::api::AppState;
use crate::crypto;
use crate::db::{models::*, repo};
use crate::deploy::executor;
use crate::hostpath::{host_to_container, container_to_host};
use tokio::process::Command;

// ── Filesystem browsing ──

pub async fn get_home_dir() -> impl IntoResponse {
    Json(serde_json::json!({ "path": "/" }))
}

#[derive(Deserialize)]
pub struct BrowseQuery {
    pub path: Option<String>,
}

#[derive(serde::Serialize)]
pub struct BrowseEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
}

pub async fn browse_filesystem(
    Query(query): Query<BrowseQuery>,
) -> impl IntoResponse {
    let host_path = query.path.unwrap_or_else(|| "/".to_string());

    if !host_path.starts_with('/') {
        return (StatusCode::BAD_REQUEST, "Path must be absolute").into_response();
    }

    // Map host path to container path
    let container_path = host_to_container(&host_path);
    let base = std::path::Path::new(&container_path);

    let base = match base.canonicalize() {
        Ok(p) => p,
        Err(_) => return (StatusCode::NOT_FOUND, "Path does not exist").into_response(),
    };

    let current_host = container_to_host(&base.to_string_lossy());

    let mut entries = Vec::new();

    // Add parent (in host path terms)
    if current_host != "/" {
        let parent = std::path::Path::new(&current_host)
            .parent()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_else(|| "/".to_string());
        entries.push(BrowseEntry {
            name: "..".to_string(),
            path: parent,
            is_dir: true,
        });
    }

    let read_dir = match std::fs::read_dir(&base) {
        Ok(rd) => rd,
        Err(e) => return (StatusCode::FORBIDDEN, format!("Cannot read directory: {}", e)).into_response(),
    };

    for entry in read_dir.flatten() {
        let metadata = match entry.metadata() { Ok(m) => m, Err(_) => continue };
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.') { continue; }

        // Return host paths to the frontend
        let entry_host_path = if current_host == "/" {
            format!("/{}", name)
        } else {
            format!("{}/{}", current_host, name)
        };

        entries.push(BrowseEntry {
            name,
            path: entry_host_path,
            is_dir: metadata.is_dir(),
        });
    }

    entries.sort_by(|a, b| {
        if a.name == ".." { return std::cmp::Ordering::Less; }
        if b.name == ".." { return std::cmp::Ordering::Greater; }
        b.is_dir.cmp(&a.is_dir).then(a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });

    Json(serde_json::json!({
        "current": current_host,
        "entries": entries,
    })).into_response()
}

// ── Projects ──

pub async fn list_projects(State(state): State<AppState>) -> impl IntoResponse {
    match repo::list_projects(&state.pool).await {
        Ok(projects) => {
            let mut summaries = Vec::new();
            for p in projects {
                let last_deploy = repo::get_latest_deploy(&state.pool, p.id).await.ok().flatten();
                summaries.push(ProjectSummary {
                    id: p.id,
                    name: p.name,
                    repo_url: p.repo_url,
                    branch: p.branch,
                    local_path: p.local_path,
                    compose_file: p.compose_file,
                    service_name: p.service_name,
                    poll_interval_secs: p.poll_interval_secs,
                    polling_enabled: p.polling_enabled,
                    auto_deploy: p.auto_deploy,
                    has_pat: p.pat_encrypted.is_some(),
                    has_webhook_secret: p.webhook_secret.is_some(),
                    compose_args: p.compose_args,
                    notify_url: p.notify_url,
                    build_timeout_secs: p.build_timeout_secs,
                    last_deploy,
                });
            }
            Json(summaries).into_response()
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

pub async fn get_project(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> impl IntoResponse {
    match repo::get_project(&state.pool, id).await {
        Ok(Some(p)) => {
            let last_deploy = repo::get_latest_deploy(&state.pool, p.id).await.ok().flatten();
            Json(ProjectSummary {
                id: p.id,
                name: p.name,
                repo_url: p.repo_url,
                branch: p.branch,
                local_path: p.local_path,
                compose_file: p.compose_file,
                service_name: p.service_name,
                poll_interval_secs: p.poll_interval_secs,
                polling_enabled: p.polling_enabled,
                auto_deploy: p.auto_deploy,
                has_pat: p.pat_encrypted.is_some(),
                has_webhook_secret: p.webhook_secret.is_some(),
                compose_args: p.compose_args,
                notify_url: p.notify_url,
                last_deploy,
            }).into_response()
        }
        Ok(None) => StatusCode::NOT_FOUND.into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

pub async fn create_project(
    State(state): State<AppState>,
    Json(input): Json<CreateProject>,
) -> impl IntoResponse {
    let pat_encrypted = input.pat.as_ref().map(|pat| {
        crypto::encrypt_pat(pat, &state.encryption_key)
    });

    let pat_encrypted = match pat_encrypted {
        Some(Ok(v)) => Some(v),
        Some(Err(e)) => return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
        None => None,
    };

    match repo::create_project(&state.pool, &input, pat_encrypted).await {
        Ok(project) => (StatusCode::CREATED, Json(project)).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

pub async fn update_project(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
    Json(input): Json<UpdateProject>,
) -> impl IntoResponse {
    let pat_encrypted = input.pat.as_ref().map(|pat| {
        crypto::encrypt_pat(pat, &state.encryption_key).ok()
    });

    match repo::update_project(&state.pool, id, &input, pat_encrypted).await {
        Ok(Some(project)) => Json(project).into_response(),
        Ok(None) => StatusCode::NOT_FOUND.into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

pub async fn delete_project(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> impl IntoResponse {
    match repo::delete_project(&state.pool, id).await {
        Ok(true) => StatusCode::NO_CONTENT.into_response(),
        Ok(false) => StatusCode::NOT_FOUND.into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

// ── Manual deploy trigger ──

pub async fn trigger_deploy(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> impl IntoResponse {
    let project = match repo::get_project(&state.pool, id).await {
        Ok(Some(p)) => p,
        Ok(None) => return StatusCode::NOT_FOUND.into_response(),
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    };

    // Check if a deploy is already running
    if repo::has_running_deploy(&state.pool, project.id).await.unwrap_or(false) {
        return (StatusCode::CONFLICT, Json(serde_json::json!({
            "error": "A deploy is already in progress for this project"
        }))).into_response();
    }

    let deploy = match repo::create_deploy(&state.pool, project.id, "manual").await {
        Ok(d) => d,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    };

    let pool = state.pool.clone();
    let broadcaster = state.broadcaster.clone();
    let key = state.encryption_key;
    let global_pat = repo::get_setting(&state.pool, "global_pat").await.ok().flatten()
        .and_then(|encrypted| crypto::decrypt_pat(&encrypted, &key).ok());

    tokio::spawn(async move {
        if let Err(e) = executor::run_deploy(
            &pool, &broadcaster, &project, deploy.id,
            &key, global_pat.as_deref(),
        ).await {
            tracing::error!("Manual deploy failed: {}", e);
        }
    });

    (StatusCode::ACCEPTED, Json(serde_json::json!({
        "deploy_id": deploy.id,
        "status": "accepted"
    }))).into_response()
}

pub async fn cancel_deploy(
    State(state): State<AppState>,
    Path((_project_id, deploy_id)): Path<(Uuid, Uuid)>,
) -> impl IntoResponse {
    // Kill the running process and mark as cancelled
    state.broadcaster.cancel(deploy_id).await;

    match repo::update_deploy_status(&state.pool, deploy_id, "failed", None, Some("Cancelled by user")).await {
        Ok(_) => {
            Json(serde_json::json!({ "status": "cancelled" })).into_response()
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

// ── Deploys ──

#[derive(Deserialize)]
pub struct DeployQuery {
    pub limit: Option<i64>,
}

pub async fn list_deploys(
    State(state): State<AppState>,
    Path(project_id): Path<Uuid>,
    Query(query): Query<DeployQuery>,
) -> impl IntoResponse {
    let limit = query.limit.unwrap_or(20);
    match repo::list_deploys(&state.pool, project_id, limit).await {
        Ok(deploys) => Json(deploys).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

pub async fn get_deploy_logs(
    State(state): State<AppState>,
    Path((_project_id, deploy_id)): Path<(Uuid, Uuid)>,
) -> impl IntoResponse {
    match repo::get_deploy_logs(&state.pool, deploy_id).await {
        Ok(logs) => Json(logs).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

// ── Settings ──

#[derive(Deserialize)]
pub struct SetGlobalPat {
    pub pat: String,
}

pub async fn get_settings(State(state): State<AppState>) -> impl IntoResponse {
    let has_global_pat = repo::get_setting(&state.pool, "global_pat")
        .await
        .ok()
        .flatten()
        .is_some();

    let host_os = repo::get_setting(&state.pool, "host_os").await.ok().flatten();

    Json(serde_json::json!({
        "has_global_pat": has_global_pat,
        "host_os": host_os,
    })).into_response()
}

#[derive(Deserialize)]
pub struct SetOsRequest {
    pub os: String,
}

pub async fn set_os(
    State(state): State<AppState>,
    Json(input): Json<SetOsRequest>,
) -> impl IntoResponse {
    match repo::set_setting(&state.pool, "host_os", &input.os).await {
        Ok(_) => StatusCode::OK.into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

pub async fn self_update(
) -> impl IntoResponse {
    // Find the orqy install directory on the host by looking for update.sh
    // The host root is mounted at /host
    let update_script = find_update_script();
    let script = match update_script {
        Some(s) => s,
        None => return (StatusCode::NOT_FOUND, "Could not find orqy install directory. Make sure update.sh exists.").into_response(),
    };

    // Get the host path for the orqy directory
    let host_dir = crate::hostpath::container_to_host(&script);
    let host_dir = std::path::Path::new(&host_dir).parent()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|| "/".to_string());

    // Use nsenter to run the update script directly on the host
    // PID 1 is always the host's init process
    let result = Command::new("nsenter")
        .args([
            "--target", "1",
            "--mount", "--uts", "--ipc", "--net", "--pid",
            "--", "sh", "-c",
            &format!("cd '{}' && nohup sh update.sh > /tmp/orqy-update.log 2>&1 &", host_dir),
        ])
        .output()
        .await;

    match result {
        Ok(_) => {
            tracing::info!("Self-update initiated from {}", script);
            Json(serde_json::json!({
                "status": "updating",
                "message": "Orqy is updating. The page will reload when ready."
            })).into_response()
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to start update: {}", e)).into_response(),
    }
}

fn find_update_script() -> Option<String> {
    // Check common locations for the orqy install
    let host_prefix = if std::path::Path::new("/host").exists() { "/host" } else { "" };

    // Search for update.sh in likely locations
    let candidates = [
        format!("{}/app/update.sh", host_prefix),  // If orqy dir is mounted directly
    ];

    for path in &candidates {
        if std::path::Path::new(path).exists() {
            return Some(path.clone());
        }
    }

    // Try to find it by searching common paths
    let search_dirs = ["data/apps", "opt", "home", "Users"];
    for dir in &search_dirs {
        let base = format!("{}/{}", host_prefix, dir);
        if let Ok(output) = std::process::Command::new("find")
            .args([&base, "-maxdepth", "4", "-name", "update.sh", "-path", "*/orqy/*"])
            .output()
        {
            let stdout = String::from_utf8_lossy(&output.stdout);
            if let Some(path) = stdout.lines().next() {
                let path = path.trim();
                if !path.is_empty() {
                    return Some(path.to_string());
                }
            }
        }
    }

    None
}

pub async fn factory_reset(
    State(state): State<AppState>,
) -> impl IntoResponse {
    // Delete everything in reverse dependency order
    let queries = [
        "DELETE FROM deploy_logs",
        "DELETE FROM deploys",
        "DELETE FROM projects",
        "DELETE FROM settings",
        "DELETE FROM users",
    ];
    for q in queries {
        if let Err(e) = sqlx::query(q).execute(&state.pool).await {
            return (StatusCode::INTERNAL_SERVER_ERROR, format!("Reset failed: {}", e)).into_response();
        }
    }
    tracing::warn!("Factory reset completed — all data cleared");
    StatusCode::NO_CONTENT.into_response()
}

pub async fn set_global_pat(
    State(state): State<AppState>,
    Json(input): Json<SetGlobalPat>,
) -> impl IntoResponse {
    // Store global PAT encrypted
    match crypto::encrypt_pat(&input.pat, &state.encryption_key) {
        Ok(encrypted) => {
            match repo::set_setting(&state.pool, "global_pat", &encrypted).await {
                Ok(_) => StatusCode::OK.into_response(),
                Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
            }
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

pub async fn delete_global_pat(
    State(state): State<AppState>,
) -> impl IntoResponse {
    match repo::delete_setting(&state.pool, "global_pat").await {
        Ok(_) => StatusCode::NO_CONTENT.into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

// ── Repo check & clone ──

#[derive(Deserialize)]
pub struct CheckRepoQuery {
    pub path: String,
}

#[derive(serde::Serialize)]
pub struct RepoCheck {
    pub exists: bool,
    pub is_git_repo: bool,
    pub remote_url: Option<String>,
}

pub async fn check_repo(
    Query(query): Query<CheckRepoQuery>,
) -> impl IntoResponse {
    let container_path = host_to_container(&query.path);
    let p = std::path::Path::new(&container_path);
    if !p.exists() {
        return Json(RepoCheck { exists: false, is_git_repo: false, remote_url: None }).into_response();
    }
    if !p.join(".git").exists() {
        return Json(RepoCheck { exists: true, is_git_repo: false, remote_url: None }).into_response();
    }
    let _ = Command::new("git")
        .args(["config", "--global", "--add", "safe.directory", &container_path])
        .output()
        .await;
    let remote = Command::new("git")
        .args(["remote", "get-url", "origin"])
        .current_dir(p)
        .output()
        .await
        .ok()
        .and_then(|o| if o.status.success() {
            Some(String::from_utf8_lossy(&o.stdout).trim().to_string())
        } else {
            None
        });
    Json(RepoCheck { exists: true, is_git_repo: true, remote_url: remote }).into_response()
}

#[derive(Deserialize)]
pub struct CloneRequest {
    pub repo_url: String,
    pub path: String,
    pub branch: Option<String>,
    pub pat: Option<String>,
}

pub async fn clone_repo(
    State(state): State<AppState>,
    Json(input): Json<CloneRequest>,
) -> impl IntoResponse {
    // Resolve PAT
    let pat = if let Some(ref p) = input.pat {
        if !p.is_empty() { Some(p.clone()) } else { None }
    } else {
        match repo::get_setting(&state.pool, "global_pat").await {
            Ok(Some(encrypted)) => crypto::decrypt_pat(&encrypted, &state.encryption_key).ok(),
            _ => None,
        }
    };

    let url = if let Some(ref token) = pat {
        executor::inject_pat_into_url(&input.repo_url, token)
    } else {
        input.repo_url.clone()
    };

    let mut args = vec!["clone".to_string()];
    if let Some(ref branch) = input.branch {
        args.push("-b".to_string());
        args.push(branch.clone());
    }
    args.push(url);
    args.push(host_to_container(&input.path));

    let output = match Command::new("git")
        .args(&args)
        .output()
        .await
    {
        Ok(o) => o,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to run git: {}", e)).into_response(),
    };

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return (StatusCode::UNPROCESSABLE_ENTITY, Json(serde_json::json!({
            "error": "Clone failed",
            "detail": stderr.trim(),
        }))).into_response();
    }

    Json(serde_json::json!({ "success": true })).into_response()
}

// ── Docker containers ──

#[derive(Deserialize)]
pub struct ContainersQuery {
    pub compose_file: Option<String>,
    pub path: Option<String>,
}

pub async fn list_containers(
    Query(query): Query<ContainersQuery>,
) -> impl IntoResponse {
    // If a path and compose file are provided, list services from the compose file on host
    if let Some(ref dir) = query.path {
        let container_dir = host_to_container(dir);
        let compose_file = query.compose_file.as_deref().unwrap_or("docker-compose.yml");
        let output = match Command::new("docker")
            .args(["compose", "-f", compose_file, "config", "--services"])
            .current_dir(&container_dir)
            .output()
            .await
        {
            Ok(o) => o,
            Err(_) => {
                return list_all_containers().await;
            }
        };

        if output.status.success() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            let services: Vec<String> = stdout.lines().map(|s| s.to_string()).filter(|s| !s.is_empty()).collect();
            return Json(serde_json::json!({ "containers": services, "source": "compose" })).into_response();
        }
    }

    list_all_containers().await
}

async fn list_all_containers() -> axum::response::Response {
    let output = match Command::new("docker")
        .args(["ps", "--format", "{{.Names}}"])
        .output()
        .await
    {
        Ok(o) => o,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to run docker: {}", e)).into_response(),
    };

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return (StatusCode::INTERNAL_SERVER_ERROR, format!("Docker error: {}", stderr)).into_response();
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut containers: Vec<String> = stdout.lines().map(|s| s.to_string()).filter(|s| !s.is_empty()).collect();
    containers.sort();

    Json(serde_json::json!({ "containers": containers, "source": "docker" })).into_response()
}

// ── Repo branches ──

#[derive(Deserialize)]
pub struct BranchesQuery {
    pub repo_url: String,
    pub pat: Option<String>,
}

pub async fn list_branches(
    State(state): State<AppState>,
    Query(query): Query<BranchesQuery>,
) -> impl IntoResponse {
    // Resolve PAT: query param > global
    let pat = if let Some(ref p) = query.pat {
        if !p.is_empty() { Some(p.clone()) } else { None }
    } else {
        // Try global PAT
        match repo::get_setting(&state.pool, "global_pat").await {
            Ok(Some(encrypted)) => crypto::decrypt_pat(&encrypted, &state.encryption_key).ok(),
            _ => None,
        }
    };

    let url = if let Some(ref token) = pat {
        executor::inject_pat_into_url(&query.repo_url, token)
    } else {
        query.repo_url.clone()
    };

    let output = match Command::new("git")
        .args(["ls-remote", "--heads", &url])
        .output()
        .await
    {
        Ok(o) => o,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to run git: {}", e)).into_response(),
    };

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let msg = if stderr.contains("Authentication failed") || stderr.contains("could not read Username") {
            "Authentication required. Set a global PAT in Settings or provide a project PAT."
        } else {
            "Failed to list branches. Check the repository URL."
        };
        return (StatusCode::UNPROCESSABLE_ENTITY, Json(serde_json::json!({
            "error": msg,
            "detail": stderr.trim(),
        }))).into_response();
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut branches: Vec<String> = stdout
        .lines()
        .filter_map(|line| {
            line.split("refs/heads/").nth(1).map(|b| b.to_string())
        })
        .collect();
    branches.sort();

    Json(serde_json::json!({ "branches": branches })).into_response()
}
