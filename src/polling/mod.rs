use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use tokio::time::{interval, Duration};
use uuid::Uuid;

use crate::crypto;
use crate::db::{models::Project, repo};
use crate::deploy::{executor, DeployBroadcaster};
use sqlx::PgPool;

/// Tracks the last known commit SHA per project to detect changes.
type CommitCache = Arc<RwLock<HashMap<Uuid, String>>>;

/// Start the background polling engine.
/// Spawns a loop that periodically checks all polling-enabled projects.
pub fn start_polling(
    pool: PgPool,
    broadcaster: DeployBroadcaster,
    encryption_key: [u8; 32],
) -> tokio::task::JoinHandle<()> {
    let commit_cache: CommitCache = Arc::new(RwLock::new(HashMap::new()));

    tokio::spawn(async move {
        // Main tick — check every 15 seconds which projects are due for a poll
        let mut ticker = interval(Duration::from_secs(15));
        let mut last_poll: HashMap<Uuid, std::time::Instant> = HashMap::new();

        loop {
            ticker.tick().await;

            let projects = match repo::list_projects(&pool).await {
                Ok(p) => p,
                Err(e) => {
                    tracing::error!("Failed to list projects for polling: {}", e);
                    continue;
                }
            };

            // Resolve global PAT once per tick (decrypt it)
            let global_pat = repo::get_setting(&pool, "global_pat").await.ok().flatten()
                .and_then(|encrypted| crypto::decrypt_pat(&encrypted, &encryption_key).ok());

            for project in projects {
                if !project.polling_enabled || !project.auto_deploy {
                    continue;
                }

                let now = std::time::Instant::now();
                let poll_due = match last_poll.get(&project.id) {
                    Some(last) => now.duration_since(*last).as_secs() >= project.poll_interval_secs as u64,
                    None => true,
                };

                if !poll_due {
                    continue;
                }

                last_poll.insert(project.id, now);

                // Check for new commits
                match check_for_changes(&project, &commit_cache, &encryption_key, global_pat.as_deref()).await {
                    Ok(true) => {
                        tracing::info!("Change detected for project '{}', triggering deploy", project.name);
                        let pool = pool.clone();
                        let broadcaster = broadcaster.clone();
                        let key = encryption_key;
                        let gp = global_pat.clone();

                        tokio::spawn(async move {
                            match repo::create_deploy(&pool, project.id, "poll").await {
                                Ok(deploy) => {
                                    if let Err(e) = executor::run_deploy(
                                        &pool, &broadcaster, &project, deploy.id,
                                        &key, gp.as_deref(),
                                    ).await {
                                        tracing::error!("Deploy failed for '{}': {}", project.name, e);
                                    }
                                }
                                Err(e) => tracing::error!("Failed to create deploy record: {}", e),
                            }
                        });
                    }
                    Ok(false) => {
                        tracing::debug!("No changes for project '{}'", project.name);
                    }
                    Err(e) => {
                        tracing::warn!("Failed to check changes for '{}': {}", project.name, e);
                    }
                }
            }
        }
    })
}

/// Check if the remote branch has new commits compared to our cache.
async fn check_for_changes(
    project: &Project,
    cache: &CommitCache,
    encryption_key: &[u8; 32],
    global_pat: Option<&str>,
) -> anyhow::Result<bool> {
    // Resolve PAT: project-level > global
    let pat = if let Some(ref encrypted) = project.pat_encrypted {
        Some(crypto::decrypt_pat(encrypted, encryption_key)?)
    } else {
        global_pat.map(|s| s.to_string())
    };

    // Build authenticated URL for ls-remote
    let remote_url = if let Some(ref token) = pat {
        executor::inject_pat_into_url(&project.repo_url, token)
    } else {
        project.repo_url.clone()
    };

    let output = tokio::process::Command::new("git")
        .args(["ls-remote", &remote_url, &project.branch])
        .current_dir(&project.local_path)
        .output()
        .await?;

    if !output.status.success() {
        anyhow::bail!("git ls-remote failed: {}", String::from_utf8_lossy(&output.stderr));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let remote_sha = stdout.split_whitespace().next().unwrap_or("").to_string();

    if remote_sha.is_empty() {
        return Ok(false);
    }

    let mut cache = cache.write().await;
    let changed = match cache.get(&project.id) {
        Some(cached_sha) => cached_sha != &remote_sha,
        None => {
            // First time — get current local SHA to seed the cache
            let local = tokio::process::Command::new("git")
                .args(["rev-parse", "HEAD"])
                .current_dir(&project.local_path)
                .output()
                .await?;
            let local_sha = String::from_utf8_lossy(&local.stdout).trim().to_string();
            local_sha != remote_sha
        }
    };

    cache.insert(project.id, remote_sha);
    Ok(changed)
}
