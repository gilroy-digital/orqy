use axum::{
    extract::{Request, State},
    http::{header, StatusCode},
    middleware::Next,
    response::{IntoResponse, Response},
    Json,
};
use serde::Deserialize;
use sha2::{Digest, Sha256};
use sqlx::PgPool;

use crate::db::repo;

/// Check if setup has been completed (at least one user exists).
pub async fn is_setup_complete(pool: &PgPool) -> bool {
    let count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM users")
        .fetch_one(pool)
        .await
        .unwrap_or((0,));
    count.0 > 0
}

/// Hash a password with a salt using SHA256.
pub fn hash_password(password: &str, salt: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(format!("{}:{}", salt, password).as_bytes());
    hex::encode(hasher.finalize())
}

/// Generate a session token.
pub fn generate_token() -> String {
    use rand::RngCore;
    let mut bytes = [0u8; 32];
    rand::rngs::OsRng.fill_bytes(&mut bytes);
    hex::encode(bytes)
}

// ── Setup endpoints (no auth required) ──

#[derive(Deserialize)]
pub struct SetupRequest {
    pub username: String,
    pub password: String,
    pub host_os: Option<String>, // "mac", "windows", "linux"
}

pub async fn get_setup_status(
    State(state): State<crate::api::AppState>,
) -> impl IntoResponse {
    let setup_complete = is_setup_complete(&state.pool).await;
    let system_info = detect_system_info();

    Json(serde_json::json!({
        "setup_complete": setup_complete,
        "system": system_info,
    }))
}

pub async fn do_setup(
    State(state): State<crate::api::AppState>,
    Json(input): Json<SetupRequest>,
) -> impl IntoResponse {
    // Only allow setup if no users exist
    if is_setup_complete(&state.pool).await {
        return (StatusCode::CONFLICT, "Setup already completed").into_response();
    }

    if input.username.trim().is_empty() || input.password.len() < 6 {
        return (StatusCode::BAD_REQUEST, "Username required, password must be at least 6 characters").into_response();
    }

    // Hash password
    let salt = generate_token();
    let hash = hash_password(&input.password, &salt);
    let stored = format!("{}:{}", salt, hash);

    // Create user
    if let Err(e) = sqlx::query("INSERT INTO users (username, password_hash) VALUES ($1, $2)")
        .bind(input.username.trim())
        .bind(&stored)
        .execute(&state.pool)
        .await
    {
        return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response();
    }

    // Store OS preference if provided
    if let Some(ref os) = input.host_os {
        let _ = repo::set_setting(&state.pool, "host_os", os).await;
    }

    // Generate session token
    let token = generate_token();
    let _ = repo::set_setting(&state.pool, &format!("session:{}", token), input.username.trim()).await;

    Json(serde_json::json!({ "token": token })).into_response()
}

// ── Login ──

#[derive(Deserialize)]
pub struct LoginRequest {
    pub username: String,
    pub password: String,
}

pub async fn login(
    State(state): State<crate::api::AppState>,
    Json(input): Json<LoginRequest>,
) -> impl IntoResponse {
    let row: Option<(String, String)> = sqlx::query_as(
        "SELECT username, password_hash FROM users WHERE username = $1"
    )
        .bind(&input.username)
        .fetch_optional(&state.pool)
        .await
        .ok()
        .flatten();

    let (_, stored_hash) = match row {
        Some(r) => r,
        None => return (StatusCode::UNAUTHORIZED, "Invalid credentials").into_response(),
    };

    // Verify password
    let parts: Vec<&str> = stored_hash.splitn(2, ':').collect();
    if parts.len() != 2 {
        return (StatusCode::INTERNAL_SERVER_ERROR, "Corrupt password hash").into_response();
    }
    let (salt, hash) = (parts[0], parts[1]);
    let computed = hash_password(&input.password, salt);

    if computed != hash {
        return (StatusCode::UNAUTHORIZED, "Invalid credentials").into_response();
    }

    // Generate session token
    let token = generate_token();
    let _ = repo::set_setting(&state.pool, &format!("session:{}", token), &input.username).await;

    Json(serde_json::json!({ "token": token })).into_response()
}

pub async fn logout(
    State(state): State<crate::api::AppState>,
    req: Request,
) -> impl IntoResponse {
    if let Some(token) = extract_token(&req) {
        let _ = repo::delete_setting(&state.pool, &format!("session:{}", token)).await;
    }
    StatusCode::NO_CONTENT
}

// ── Auth middleware ──

pub async fn auth_middleware(
    State(state): State<crate::api::AppState>,
    req: Request,
    next: Next,
) -> Response {
    // Skip auth if setup not complete
    if !is_setup_complete(&state.pool).await {
        return next.run(req).await;
    }

    // Check for valid session token
    if let Some(token) = extract_token(&req) {
        let key = format!("session:{}", token);
        if let Ok(Some(_)) = repo::get_setting(&state.pool, &key).await {
            return next.run(req).await;
        }
    }

    (StatusCode::UNAUTHORIZED, "Authentication required").into_response()
}

fn extract_token(req: &Request) -> Option<String> {
    // Check Authorization header first
    if let Some(auth) = req.headers().get(header::AUTHORIZATION) {
        if let Ok(auth_str) = auth.to_str() {
            if let Some(token) = auth_str.strip_prefix("Bearer ") {
                return Some(token.to_string());
            }
        }
    }
    // Check cookie
    if let Some(cookie) = req.headers().get(header::COOKIE) {
        if let Ok(cookie_str) = cookie.to_str() {
            for part in cookie_str.split(';') {
                let part = part.trim();
                if let Some(token) = part.strip_prefix("orqy_token=") {
                    return Some(token.to_string());
                }
            }
        }
    }
    None
}

// ── System detection ──

pub fn detect_system_info() -> serde_json::Value {
    let detected_os = if std::path::Path::new("/Users").exists() {
        "mac"
    } else if std::path::Path::new("/c/Users").exists() || std::path::Path::new("/mnt/c").exists() {
        "windows"
    } else if std::path::Path::new("/home").exists() {
        "linux"
    } else {
        "unknown"
    };

    let arch = std::env::consts::ARCH;

    serde_json::json!({
        "detected_os": detected_os,
        "arch": arch,
        "container_os": std::env::consts::OS,
    })
}
