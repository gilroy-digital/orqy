use std::process::Stdio;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use uuid::Uuid;

use crate::crypto;
use crate::db::{models::*, repo};
use crate::deploy::DeployBroadcaster;
use sqlx::PgPool;

/// Execute a full deploy cycle for a project:
/// 1. git pull (with PAT auth if needed)
/// 2. docker compose down
/// 3. docker compose up -d --build
/// Streams logs in real-time to the broadcaster and persists them.
pub async fn run_deploy(
    pool: &PgPool,
    broadcaster: &DeployBroadcaster,
    project: &Project,
    deploy_id: Uuid,
    encryption_key: &[u8; 32],
    global_pat: Option<&str>,
) -> anyhow::Result<()> {
    let tx = broadcaster.get_sender(deploy_id).await;
    let mut line_num = 0i32;

    // Helper to run a command and stream output
    async fn run_cmd(
        pool: &PgPool,
        deploy_id: Uuid,
        tx: &tokio::sync::broadcast::Sender<DeployLog>,
        line_num: &mut i32,
        cmd: &str,
        args: &[&str],
        cwd: &str,
        env_vars: Vec<(&str, &str)>,
    ) -> anyhow::Result<bool> {
        // Log the command being run (redact PATs from URLs)
        let redacted_args: Vec<String> = args.iter().map(|a| {
            if a.contains('@') && a.starts_with("https://") {
                a.split('@').last().map(|host| format!("https://***@{}", host)).unwrap_or_else(|| a.to_string())
            } else {
                a.to_string()
            }
        }).collect();
        let system_msg = format!("$ {} {}", cmd, redacted_args.join(" "));
        let log = repo::append_log(pool, deploy_id, *line_num, "system", &system_msg).await?;
        let _ = tx.send(log);
        *line_num += 1;

        let mut command = Command::new(cmd);
        command.args(args).current_dir(cwd)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        for (k, v) in env_vars {
            command.env(k, v);
        }

        let mut child = command.spawn()?;

        // Stream stdout
        if let Some(stdout) = child.stdout.take() {
            let reader = BufReader::new(stdout);
            let mut lines = reader.lines();
            while let Some(line) = lines.next_line().await? {
                let log = repo::append_log(pool, deploy_id, *line_num, "stdout", &line).await?;
                let _ = tx.send(log);
                *line_num += 1;
            }
        }

        // Stream stderr
        if let Some(stderr) = child.stderr.take() {
            let reader = BufReader::new(stderr);
            let mut lines = reader.lines();
            while let Some(line) = lines.next_line().await? {
                let log = repo::append_log(pool, deploy_id, *line_num, "stderr", &line).await?;
                let _ = tx.send(log);
                *line_num += 1;
            }
        }

        let status = child.wait().await?;
        Ok(status.success())
    }

    // Mark deploy as running
    repo::update_deploy_status(pool, deploy_id, "running", None, None).await?;

    // Step 1: Git pull
    let log = repo::append_log(pool, deploy_id, line_num, "system", "=== Step 1: Pulling latest code ===").await?;
    let _ = tx.send(log);
    line_num += 1;

    // Resolve PAT: project-level override > global
    let pat = if let Some(ref encrypted) = project.pat_encrypted {
        Some(crypto::decrypt_pat(encrypted, encryption_key)?)
    } else {
        global_pat.map(|s| s.to_string())
    };

    // Build git remote URL with PAT for auth
    let repo_url = if let Some(ref token) = pat {
        inject_pat_into_url(&project.repo_url, token)
    } else {
        project.repo_url.clone()
    };

    // git fetch using authenticated URL directly
    let branch = &project.branch;
    let fetch_ok = run_cmd(
        pool, deploy_id, &tx, &mut line_num,
        "git", &["fetch", &repo_url, branch],
        &project.local_path, vec![],
    ).await?;

    if !fetch_ok {
        repo::update_deploy_status(pool, deploy_id, "failed", None, None).await?;
        broadcaster.remove(deploy_id).await;
        return Ok(());
    }

    let reset_ok = run_cmd(
        pool, deploy_id, &tx, &mut line_num,
        "git", &["reset", "--hard", "FETCH_HEAD"],
        &project.local_path, vec![],
    ).await?;

    if !reset_ok {
        repo::update_deploy_status(pool, deploy_id, "failed", None, None).await?;
        broadcaster.remove(deploy_id).await;
        return Ok(());
    }

    // Get commit info
    let output = Command::new("git")
        .args(["log", "-1", "--format=%H|%s"])
        .current_dir(&project.local_path)
        .output()
        .await?;
    let commit_info = String::from_utf8_lossy(&output.stdout);
    let parts: Vec<&str> = commit_info.trim().splitn(2, '|').collect();
    let (sha, msg) = if parts.len() == 2 {
        (Some(parts[0]), Some(parts[1]))
    } else {
        (None, None)
    };

    repo::update_deploy_status(pool, deploy_id, "running", sha, msg).await?;

    // Step 2: Docker compose down
    let log = repo::append_log(pool, deploy_id, line_num, "system", "=== Step 2: Stopping containers ===").await?;
    let _ = tx.send(log);
    line_num += 1;

    let compose_args = build_compose_args(&project.compose_file, &project.service_name, "down");
    let compose_str_args: Vec<&str> = compose_args.iter().map(|s| s.as_str()).collect();
    let down_ok = run_cmd(
        pool, deploy_id, &tx, &mut line_num,
        "docker", &compose_str_args,
        &project.local_path, vec![],
    ).await?;

    if !down_ok {
        let log = repo::append_log(pool, deploy_id, line_num, "system", "Warning: docker compose down failed, continuing anyway...").await?;
        let _ = tx.send(log);
        line_num += 1;
    }

    // Step 3: Docker compose up --build
    let log = repo::append_log(pool, deploy_id, line_num, "system", "=== Step 3: Building and starting containers ===").await?;
    let _ = tx.send(log);
    line_num += 1;

    let compose_args = build_compose_args(&project.compose_file, &project.service_name, "up");
    let compose_str_args: Vec<&str> = compose_args.iter().map(|s| s.as_str()).collect();
    let up_ok = run_cmd(
        pool, deploy_id, &tx, &mut line_num,
        "docker", &compose_str_args,
        &project.local_path, vec![],
    ).await?;

    let final_status = if up_ok { "success" } else { "failed" };
    repo::update_deploy_status(pool, deploy_id, final_status, None, None).await?;

    let log = repo::append_log(
        pool, deploy_id, line_num, "system",
        &format!("=== Deploy {} ===", final_status),
    ).await?;
    let _ = tx.send(log);

    broadcaster.remove(deploy_id).await;
    Ok(())
}

fn build_compose_args(compose_file: &str, service_name: &Option<String>, action: &str) -> Vec<String> {
    let mut args = vec![
        "compose".to_string(),
        "-f".to_string(),
        compose_file.to_string(),
    ];

    match action {
        "down" => {
            args.push("down".to_string());
            args.push("--remove-orphans".to_string());
        }
        "up" => {
            args.push("up".to_string());
            args.push("-d".to_string());
            args.push("--build".to_string());
            args.push("--force-recreate".to_string());
            if let Some(ref svc) = service_name {
                args.push(svc.clone());
            }
        }
        _ => {}
    }

    args
}

pub fn inject_pat_into_url(url: &str, pat: &str) -> String {
    // Convert https://github.com/user/repo.git -> https://<pat>@github.com/user/repo.git
    if url.starts_with("https://") {
        url.replacen("https://", &format!("https://{}@", pat), 1)
    } else {
        url.to_string()
    }
}
