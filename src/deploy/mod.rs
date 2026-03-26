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
    /// Map of deploy_id -> active child process PID
    active_pids: Arc<tokio::sync::RwLock<HashMap<Uuid, u32>>>,
    /// Set of deploy_ids that have been cancelled
    cancelled: Arc<tokio::sync::RwLock<std::collections::HashSet<Uuid>>>,
}

impl DeployBroadcaster {
    pub fn new() -> Self {
        Self {
            channels: Arc::new(tokio::sync::RwLock::new(HashMap::new())),
            active_pids: Arc::new(tokio::sync::RwLock::new(HashMap::new())),
            cancelled: Arc::new(tokio::sync::RwLock::new(std::collections::HashSet::new())),
        }
    }

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

    pub async fn subscribe(&self, deploy_id: Uuid) -> broadcast::Receiver<DeployLog> {
        let sender = self.get_sender(deploy_id).await;
        sender.subscribe()
    }

    pub async fn remove(&self, deploy_id: Uuid) {
        self.channels.write().await.remove(&deploy_id);
        self.active_pids.write().await.remove(&deploy_id);
        self.cancelled.write().await.remove(&deploy_id);
    }

    /// Register a child process PID for a deploy
    pub async fn set_pid(&self, deploy_id: Uuid, pid: u32) {
        self.active_pids.write().await.insert(deploy_id, pid);
    }

    /// Mark a deploy as cancelled and kill its active process
    pub async fn cancel(&self, deploy_id: Uuid) {
        self.cancelled.write().await.insert(deploy_id);
        // Kill the active child process if any
        if let Some(pid) = self.active_pids.read().await.get(&deploy_id) {
            // Kill the process group (negative PID kills the group)
            unsafe {
                libc::kill(-(*pid as i32), libc::SIGKILL);
            }
        }
    }

    /// Check if a deploy has been cancelled
    pub async fn is_cancelled(&self, deploy_id: Uuid) -> bool {
        self.cancelled.read().await.contains(&deploy_id)
    }
}
