mod api;
mod auth;
mod crypto;
mod db;
mod deploy;
pub mod hostpath;
mod polling;
mod webhook;

use axum::{
    middleware,
    routing::{get, post},
    Router,
};
use tower_http::cors::CorsLayer;
use tower_http::services::{ServeDir, ServeFile};
use tracing_subscriber::EnvFilter;

use api::AppState;
use deploy::DeployBroadcaster;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // Load .env
    dotenvy::dotenv().ok();

    // Init tracing
    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::from_default_env().add_directive("orqy=info".parse()?))
        .init();

    // Config from env
    let database_url = std::env::var("DATABASE_URL")
        .unwrap_or_else(|_| "postgres://orqy:orqy@localhost:5432/orqy".to_string());
    let encryption_secret = std::env::var("ENCRYPTION_SECRET")
        .unwrap_or_else(|_| "change-me-in-production-please".to_string());
    let port: u16 = std::env::var("PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(3456);

    // Init database
    let pool = db::init_pool(&database_url).await?;
    tracing::info!("Database connected and migrations applied");

    // Init broadcaster
    let broadcaster = DeployBroadcaster::new();

    // Derive encryption key
    let encryption_key = crypto::derive_key(&encryption_secret);
    if encryption_secret == "change-me-in-production" || encryption_secret == "change-me-in-production-please" {
        tracing::warn!("Using default encryption key — set ENCRYPTION_SECRET in .env for production");
    }

    // App state
    let state = AppState {
        pool: pool.clone(),
        broadcaster: broadcaster.clone(),
        encryption_key,
    };

    // Start polling engine
    let _polling_handle = polling::start_polling(pool.clone(), broadcaster.clone(), encryption_key);
    tracing::info!("Polling engine started");

    // Public routes (no auth required)
    let public_api = Router::new()
        .route("/setup/status", get(auth::get_setup_status))
        .route("/setup", post(auth::do_setup))
        .route("/auth/login", post(auth::login))
        .route("/auth/logout", post(auth::logout))
        // Webhooks must be public
        .route("/webhook/:project_id", post(webhook::handle_webhook));

    // Protected routes (auth required)
    let protected_api = Router::new()
        // Projects
        .route("/projects", get(api::routes::list_projects).post(api::routes::create_project))
        .route("/projects/:id", get(api::routes::get_project).put(api::routes::update_project).delete(api::routes::delete_project))
        // Deploy trigger
        .route("/projects/:id/deploy", post(api::routes::trigger_deploy))
        // Deploy history & logs
        .route("/projects/:project_id/deploys", get(api::routes::list_deploys))
        .route("/projects/:project_id/deploys/:deploy_id/logs", get(api::routes::get_deploy_logs))
        // WebSocket for live logs
        .route("/projects/:project_id/deploys/:deploy_id/ws", get(api::ws::deploy_logs_ws))
        // Settings
        .route("/settings", get(api::routes::get_settings))
        .route("/settings/pat", post(api::routes::set_global_pat).delete(api::routes::delete_global_pat))
        .route("/settings/reset", post(api::routes::factory_reset))
        // Filesystem browsing
        .route("/browse", get(api::routes::browse_filesystem))
        .route("/homedir", get(api::routes::get_home_dir))
        // Repo branches
        .route("/branches", get(api::routes::list_branches))
        // Docker containers
        .route("/containers", get(api::routes::list_containers))
        // Repo check & clone
        .route("/check-repo", get(api::routes::check_repo))
        .route("/clone", post(api::routes::clone_repo))
        .layer(middleware::from_fn_with_state(state.clone(), auth::auth_middleware));

    let api = Router::new()
        .merge(public_api)
        .merge(protected_api);

    // Serve frontend static files + API
    let app = Router::new()
        .nest("/api", api)
        .fallback_service(ServeDir::new("frontend/dist").not_found_service(ServeFile::new("frontend/dist/index.html")))
        .layer(CorsLayer::permissive())
        .with_state(state);

    let addr = format!("0.0.0.0:{}", port);
    tracing::info!("Deployer listening on {}", addr);

    let listener = tokio::net::TcpListener::bind(&addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}
