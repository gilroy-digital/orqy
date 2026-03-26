use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        Path, State,
    },
    response::IntoResponse,
};
use futures::SinkExt;
use uuid::Uuid;

use crate::api::AppState;
use crate::db::repo;

/// WebSocket endpoint: /api/projects/:project_id/deploys/:deploy_id/ws
/// Streams deploy log lines in real-time.
pub async fn deploy_logs_ws(
    ws: WebSocketUpgrade,
    State(state): State<AppState>,
    Path((_project_id, deploy_id)): Path<(Uuid, Uuid)>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_ws(socket, state, deploy_id))
}

async fn handle_ws(mut socket: WebSocket, state: AppState, deploy_id: Uuid) {
    // First, send all existing log lines
    if let Ok(existing_logs) = repo::get_deploy_logs(&state.pool, deploy_id).await {
        for log in existing_logs {
            let json = serde_json::to_string(&log).unwrap_or_default();
            if socket.send(Message::Text(json.into())).await.is_err() {
                return;
            }
        }
    }

    // Then subscribe to live updates
    let mut rx = state.broadcaster.subscribe(deploy_id).await;

    loop {
        match rx.recv().await {
            Ok(log_line) => {
                let json = serde_json::to_string(&log_line).unwrap_or_default();
                if socket.send(Message::Text(json.into())).await.is_err() {
                    break;
                }
            }
            Err(tokio::sync::broadcast::error::RecvError::Closed) => {
                // Deploy finished, send close
                let _ = socket.send(Message::Close(None)).await;
                break;
            }
            Err(tokio::sync::broadcast::error::RecvError::Lagged(n)) => {
                let msg = format!("{{\"warning\": \"Skipped {} log lines\"}}", n);
                let _ = socket.send(Message::Text(msg.into())).await;
            }
        }
    }
}
