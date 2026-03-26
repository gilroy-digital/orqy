pub mod executor;

use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::broadcast;
use uuid::Uuid;

use crate::db::models::DeployLog;

/// Central hub for broadcasting deploy log lines to WebSocket clients.
#[derive(Clone)]
pub struct DeployBroadcaster {
    /// Map of deploy_id -> broadcast sender
    channels: Arc<tokio::sync::RwLock<HashMap<Uuid, broadcast::Sender<DeployLog>>>>,
}

impl DeployBroadcaster {
    pub fn new() -> Self {
        Self {
            channels: Arc::new(tokio::sync::RwLock::new(HashMap::new())),
        }
    }

    /// Get or create a broadcast channel for a deploy.
    pub async fn get_sender(&self, deploy_id: Uuid) -> broadcast::Sender<DeployLog> {
        let mut channels = self.channels.write().await;
        channels
            .entry(deploy_id)
            .or_insert_with(|| {
                let (tx, _) = broadcast::channel(256);
                tx
            })
            .clone()
    }

    /// Subscribe to log updates for a deploy.
    pub async fn subscribe(&self, deploy_id: Uuid) -> broadcast::Receiver<DeployLog> {
        let sender = self.get_sender(deploy_id).await;
        sender.subscribe()
    }

    /// Clean up channel when deploy is done.
    pub async fn remove(&self, deploy_id: Uuid) {
        let mut channels = self.channels.write().await;
        channels.remove(&deploy_id);
    }
}
