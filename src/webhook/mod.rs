use axum::{
    body::Bytes,
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    response::IntoResponse,
    Json,
};
use hmac::{Hmac, Mac};
use sha2::Sha256;
use uuid::Uuid;

use crate::api::AppState;
use crate::crypto;
use crate::db::repo;
use crate::deploy::executor;

type HmacSha256 = Hmac<Sha256>;

/// POST /api/webhook/:project_id
/// Receives GitHub/GitLab push webhooks.
pub async fn handle_webhook(
    State(state): State<AppState>,
    Path(project_id): Path<Uuid>,
    headers: HeaderMap,
    body: Bytes,
) -> impl IntoResponse {
    // Look up the project
    let project = match repo::get_project(&state.pool, project_id).await {
        Ok(Some(p)) => p,
        Ok(None) => return (StatusCode::NOT_FOUND, "Project not found").into_response(),
        Err(_) => return (StatusCode::INTERNAL_SERVER_ERROR, "Database error").into_response(),
    };

    // Verify webhook signature if a secret is configured
    if let Some(ref secret) = project.webhook_secret {
        if !verify_github_signature(&headers, &body, secret) {
            return (StatusCode::UNAUTHORIZED, "Invalid signature").into_response();
        }
    }

    // Parse the push event to check if it's for the right branch
    let payload: serde_json::Value = match serde_json::from_slice(&body) {
        Ok(v) => v,
        Err(_) => return (StatusCode::BAD_REQUEST, "Invalid JSON").into_response(),
    };

    // GitHub sends ref as "refs/heads/branch_name"
    let push_ref = payload.get("ref").and_then(|v| v.as_str()).unwrap_or("");
    let expected_ref = format!("refs/heads/{}", project.branch);

    if push_ref != expected_ref {
        return (StatusCode::OK, "Ignored: different branch").into_response();
    }

    if !project.auto_deploy {
        return (StatusCode::OK, "Ignored: auto-deploy disabled").into_response();
    }

    // Skip if a deploy is already running
    if repo::has_running_deploy(&state.pool, project.id).await.unwrap_or(false) {
        return (StatusCode::OK, "Ignored: deploy already in progress").into_response();
    }

    // Create deploy and run it
    let deploy = match repo::create_deploy(&state.pool, project.id, "webhook").await {
        Ok(d) => d,
        Err(_) => return (StatusCode::INTERNAL_SERVER_ERROR, "Failed to create deploy").into_response(),
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
            tracing::error!("Webhook deploy failed for '{}': {}", project.name, e);
        }
    });

    (StatusCode::ACCEPTED, Json(serde_json::json!({
        "deploy_id": deploy.id,
        "status": "accepted"
    }))).into_response()
}

fn verify_github_signature(headers: &HeaderMap, body: &[u8], secret: &str) -> bool {
    let sig_header = match headers.get("x-hub-signature-256") {
        Some(v) => v.to_str().unwrap_or(""),
        None => return false,
    };

    let sig_header = sig_header.strip_prefix("sha256=").unwrap_or("");

    let mut mac = match HmacSha256::new_from_slice(secret.as_bytes()) {
        Ok(m) => m,
        Err(_) => return false,
    };
    mac.update(body);
    let expected = hex::encode(mac.finalize().into_bytes());

    // Constant-time comparison
    expected == sig_header
}
