use std::process::Stdio;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use uuid::Uuid;

use crate::crypto;
use crate::db::{models::*, repo};
use crate::deploy::DeployBroadcaster;
use crate::hostpath::host_to_container;
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
    let timeout_duration = std::time::Duration::from_secs(project.build_timeout_secs as u64);

    match tokio::time::timeout(timeout_duration, run_deploy_inner(pool, broadcaster, project, deploy_id, encryption_key, global_pat)).await {
        Ok(result) => result,
        Err(_) => {
            // Timeout — cancel the deploy
            tracing::warn!("Deploy timed out after {}s for '{}'", project.build_timeout_secs, project.name);
            broadcaster.cancel(deploy_id).await;
            let tx = broadcaster.get_sender(deploy_id).await;
            let _ = repo::append_log(pool, deploy_id, 9999, "system",
                &format!("=== Deploy timed out after {}s ===", project.build_timeout_secs)).await;
            repo::update_deploy_status(pool, deploy_id, "failed", None, Some("Timed out")).await?;
            broadcaster.remove(deploy_id).await;
            Ok(())
        }
    }
}

async fn run_deploy_inner(
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
        broadcaster: &DeployBroadcaster,
        tx: &tokio::sync::broadcast::Sender<DeployLog>,
        line_num: &mut i32,
        cmd: &str,
        args: &[&str],
        cwd: &str,
        env_vars: Vec<(&str, &str)>,
    ) -> anyhow::Result<bool> {
        // Check if cancelled before starting
        if broadcaster.is_cancelled(deploy_id).await {
            return Ok(false);
        }

        // Log the command being run (redact PATs from URLs)
        let redacted_args: Vec<String> = args.iter().map(|a| redact_credentials(a)).collect();
        let system_msg = format!("$ {} {}", cmd, redacted_args.join(" "));
        let log = repo::append_log(pool, deploy_id, *line_num, "system", &system_msg).await?;
        let _ = tx.send(log);
        *line_num += 1;

        let mut command = Command::new(cmd);
        command.args(args).current_dir(cwd)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .process_group(0); // Create new process group so we can kill the whole tree

        for (k, v) in env_vars {
            command.env(k, v);
        }

        let mut child = command.spawn()?;

        // Register the PID so cancel can kill it
        if let Some(pid) = child.id() {
            broadcaster.set_pid(deploy_id, pid).await;
        }

        // Stream stdout
        if let Some(stdout) = child.stdout.take() {
            let reader = BufReader::new(stdout);
            let mut lines = reader.lines();
            while let Some(line) = lines.next_line().await? {
                let log = repo::append_log(pool, deploy_id, *line_num, "stdout", &redact_credentials(&line)).await?;
                let _ = tx.send(log);
                *line_num += 1;
            }
        }

        // Stream stderr
        if let Some(stderr) = child.stderr.take() {
            let reader = BufReader::new(stderr);
            let mut lines = reader.lines();
            while let Some(line) = lines.next_line().await? {
                let log = repo::append_log(pool, deploy_id, *line_num, "stderr", &redact_credentials(&line)).await?;
                let _ = tx.send(log);
                *line_num += 1;
            }
        }

        let status = child.wait().await?;
        Ok(status.success())
    }

    // Mark deploy as running
    repo::update_deploy_status(pool, deploy_id, "running", None, None).await?;

    // Send "running" webhook
    if let Ok(Some(url)) = repo::get_setting(pool, "webhook_running").await {
        send_deploy_notification(&url, project, deploy_id, "running", None, None).await;
    }

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

    // Container path for git (runs inside this container, needs /host prefix)
    // Host path for docker (daemon runs on the host, needs real host paths)
    let local_path = host_to_container(&project.local_path);
    let host_path = project.local_path.clone();

    // Mark directory as safe for git (container runs as root, host files owned by different user)
    let _ = Command::new("git")
        .args(["config", "--global", "--add", "safe.directory", &local_path])
        .output()
        .await;

    // git fetch using authenticated URL directly
    let branch = &project.branch;
    let fetch_ok = run_cmd(
        pool, deploy_id, broadcaster, &tx, &mut line_num,
        "git", &["fetch", &repo_url, branch],
        &local_path, vec![],
    ).await?;

    if !fetch_ok {
        repo::update_deploy_status(pool, deploy_id, "failed", None, None).await?;
        broadcaster.remove(deploy_id).await;
        return Ok(());
    }

    let reset_ok = run_cmd(
        pool, deploy_id, broadcaster, &tx, &mut line_num,
        "git", &["reset", "--hard", "FETCH_HEAD"],
        &local_path, vec![],
    ).await?;

    if !reset_ok {
        repo::update_deploy_status(pool, deploy_id, "failed", None, None).await?;
        broadcaster.remove(deploy_id).await;
        return Ok(());
    }

    // Get commit info
    let output = Command::new("git")
        .args(["log", "-1", "--format=%H|%s"])
        .current_dir(&local_path)
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

    // First try compose down
    // Docker commands use host_path: the Docker daemon runs on the host and
    // resolves relative paths (like "." in volume mounts) against cwd.
    let compose_args = build_compose_args(&project.compose_file, &project.service_name, "down", &host_path, &project.compose_args);
    let compose_str_args: Vec<&str> = compose_args.iter().map(|s| s.as_str()).collect();
    let down_ok = run_cmd(
        pool, deploy_id, broadcaster, &tx, &mut line_num,
        "docker", &compose_str_args,
        &local_path, vec![],
    ).await?;

    if !down_ok {
        let log = repo::append_log(pool, deploy_id, line_num, "system", "Warning: docker compose down had issues, attempting cleanup...").await?;
        let _ = tx.send(log);
        line_num += 1;

        // Force stop and remove any containers defined in the compose file
        let stop_args = build_compose_args(&project.compose_file, &project.service_name, "stop", &host_path, &project.compose_args);
        let stop_str_args: Vec<&str> = stop_args.iter().map(|s| s.as_str()).collect();
        let _ = run_cmd(
            pool, deploy_id, broadcaster, &tx, &mut line_num,
            "docker", &stop_str_args,
            &local_path, vec![],
        ).await;

        let rm_args = build_compose_args(&project.compose_file, &project.service_name, "rm", &host_path, &project.compose_args);
        let rm_str_args: Vec<&str> = rm_args.iter().map(|s| s.as_str()).collect();
        let _ = run_cmd(
            pool, deploy_id, broadcaster, &tx, &mut line_num,
            "docker", &rm_str_args,
            &local_path, vec![],
        ).await;
    }

    // Force-remove any existing containers from this compose project
    let ps_args = build_compose_args(&project.compose_file, &project.service_name, "ps", &host_path, &project.compose_args);
    let ps_str_args: Vec<&str> = ps_args.iter().map(|s| s.as_str()).collect();
    if let Ok(output) = Command::new("docker")
        .args(&ps_str_args)
        .current_dir(&local_path)
        .output()
        .await
    {
        let stdout = String::from_utf8_lossy(&output.stdout);
        for line in stdout.lines() {
            let id = line.trim();
            if !id.is_empty() {
                let _ = Command::new("docker")
                    .args(["rm", "-f", id])
                    .output()
                    .await;
            }
        }
    }

    // Step 3: Docker compose up --build
    let log = repo::append_log(pool, deploy_id, line_num, "system", "=== Step 3: Building and starting containers ===").await?;
    let _ = tx.send(log);
    line_num += 1;

    let compose_args = build_compose_args(&project.compose_file, &project.service_name, "up", &host_path, &project.compose_args);
    let compose_str_args: Vec<&str> = compose_args.iter().map(|s| s.as_str()).collect();
    let up_ok = run_cmd(
        pool, deploy_id, broadcaster, &tx, &mut line_num,
        "docker", &compose_str_args,
        &local_path, vec![],
    ).await?;

    let cancelled = broadcaster.is_cancelled(deploy_id).await;
    let final_status = if cancelled { "failed" } else if up_ok { "success" } else { "failed" };
    if !cancelled {
        repo::update_deploy_status(pool, deploy_id, final_status, None, None).await?;
    }

    let log = repo::append_log(
        pool, deploy_id, line_num, "system",
        &format!("=== Deploy {} ===", final_status),
    ).await?;
    let _ = tx.send(log);

    // Send outbound webhook notifications
    // 1. Project-level notify_url (legacy, fires for all statuses)
    if let Some(ref url) = project.notify_url {
        send_deploy_notification(url, project, deploy_id, final_status, sha, msg).await;
    }

    // 2. Global webhooks by status (project can override via notify_url)
    let webhook_key = match final_status {
        "success" => "webhook_success",
        "failed" => "webhook_failed",
        _ => "webhook_running",
    };
    if let Ok(Some(global_url)) = repo::get_setting(pool, webhook_key).await {
        send_deploy_notification(&global_url, project, deploy_id, final_status, sha, msg).await;
    }

    broadcaster.remove(deploy_id).await;
    Ok(())
}

async fn send_deploy_notification(
    url: &str,
    project: &Project,
    deploy_id: Uuid,
    status: &str,
    commit_sha: Option<&str>,
    commit_message: Option<&str>,
) {
    let payload = serde_json::json!({
        "project": project.name,
        "project_id": project.id,
        "deploy_id": deploy_id,
        "status": status,
        "branch": project.branch,
        "repo_url": project.repo_url,
        "commit_sha": commit_sha,
        "commit_message": commit_message,
        "timestamp": chrono::Utc::now().to_rfc3339(),
    });

    match reqwest::Client::new()
        .post(url)
        .header("Content-Type", "application/json")
        .json(&payload)
        .timeout(std::time::Duration::from_secs(10))
        .send()
        .await
    {
        Ok(res) => {
            tracing::info!("Deploy notification sent to {} — status {}", url, res.status());
        }
        Err(e) => {
            tracing::warn!("Failed to send deploy notification to {}: {}", url, e);
        }
    }
}

fn build_compose_args(compose_file: &str, service_name: &Option<String>, action: &str, host_path: &str, compose_args: &Option<String>) -> Vec<String> {
    let mut args = vec![
        "compose".to_string(),
    ];

    // Orqy runs inside a container with the host filesystem at /host.
    // The Docker CLI (inside Orqy) needs the container path to read the
    // compose file, env_file, Dockerfiles, etc. The Docker daemon resolves
    // volume mounts via the CLI which passes them through — since the daemon
    // communicates over the socket, paths in the compose file are what the
    // CLI sends. We use the container path for everything so the CLI can
    // read all referenced files. For volume mounts like ".:/app", "." resolves
    // to the project directory (/host/...) which the daemon receives as-is.
    // Since the host fs is bind-mounted at /host, /host/data/... IS a valid
    // path on the host (Docker daemon sees it through its own mount namespace).
    let container_path = host_to_container(host_path);
    let compose_path = if std::path::Path::new(compose_file).is_relative() {
        std::path::Path::new(&container_path).join(compose_file).to_string_lossy().to_string()
    } else {
        compose_file.to_string()
    };
    args.push("-f".to_string());
    args.push(compose_path);

    match action {
        "down" => {
            args.push("down".to_string());
            args.push("--remove-orphans".to_string());
        }
        "stop" => {
            args.push("stop".to_string());
        }
        "rm" => {
            args.push("rm".to_string());
            args.push("-f".to_string());
        }
        "ps" => {
            args.push("ps".to_string());
            args.push("-a".to_string());
            args.push("-q".to_string());
        }
        "up" => {
            args.push("up".to_string());
            args.push("-d".to_string());
            args.push("--build".to_string());
            args.push("--force-recreate".to_string());
            args.push("--remove-orphans".to_string());
            if let Some(ref svc) = service_name {
                args.push(svc.clone());
            }
        }
        _ => {}
    }

    // Add user-defined extra args after the action (e.g. --env-file .env.production, --profile prod)
    if let Some(ref extra) = compose_args {
        for arg in extra.split_whitespace() {
            args.push(arg.to_string());
        }
    }

    args
}

/// Hide credentials in any text that may contain an authenticated URL.
///
/// Git echoes the remote URL in its errors ("could not read Password for
/// 'https://<pat>@github.com'"), and that output ends up in logs, the deploy
/// log table and API responses. Every `scheme://user[:pass]@host` has its
/// userinfo replaced with `***`, and bare GitHub tokens are masked as well.
pub fn redact_credentials(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut rest = text;
    while let Some(i) = rest.find("://") {
        let (head, tail) = rest.split_at(i + 3);
        out.push_str(head);
        // The authority runs until a path, whitespace or quote.
        let end = tail
            .find(|c: char| c == '/' || c.is_whitespace() || c == '\'' || c == '"' || c == '`')
            .unwrap_or(tail.len());
        let authority = &tail[..end];
        match authority.rfind('@') {
            Some(at) => {
                out.push_str("***");
                out.push_str(&authority[at..]);
            }
            None => out.push_str(authority),
        }
        rest = &tail[end..];
    }
    out.push_str(rest);
    mask_github_tokens(&out)
}

fn mask_github_tokens(text: &str) -> String {
    const PREFIXES: [&str; 6] = ["github_pat_", "ghp_", "gho_", "ghu_", "ghs_", "ghr_"];
    let mut out = String::with_capacity(text.len());
    let mut i = 0;
    let bytes = text.as_bytes();
    while i < text.len() {
        let hit = PREFIXES.iter().find(|p| text[i..].starts_with(*p));
        if let Some(prefix) = hit {
            let start = i + prefix.len();
            let mut j = start;
            while j < bytes.len() && (bytes[j].is_ascii_alphanumeric() || bytes[j] == b'_') {
                j += 1;
            }
            if j - start >= 20 {
                out.push_str(prefix);
                out.push_str("***");
                i = j;
                continue;
            }
        }
        let ch = text[i..].chars().next().unwrap();
        out.push(ch);
        i += ch.len_utf8();
    }
    out
}

pub fn inject_pat_into_url(url: &str, pat: &str) -> String {
    // Convert https://github.com/user/repo.git -> https://<pat>@github.com/user/repo.git
    if url.starts_with("https://") {
        url.replacen("https://", &format!("https://{}@", pat), 1)
    } else {
        url.to_string()
    }
}

#[cfg(test)]
mod redact_tests {
    use super::redact_credentials;

    #[test]
    fn hides_pat_in_git_error() {
        let msg = "fatal: could not read Password for 'https://github_pat_11ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@github.com': No such device";
        let out = redact_credentials(msg);
        assert!(!out.contains("11ABCDEF"), "{out}");
        assert!(out.contains("https://***@github.com"), "{out}");
    }

    #[test]
    fn hides_user_and_password() {
        let out = redact_credentials("fetch https://user:s3cret@host.example/repo.git failed");
        assert_eq!(out, "fetch https://***@host.example/repo.git failed");
    }

    #[test]
    fn leaves_plain_urls_and_text() {
        let s = "From https://github.com/Fleebee/x\n * branch main -> FETCH_HEAD; mail me@example.com";
        assert_eq!(redact_credentials(s), s);
    }

    #[test]
    fn masks_bare_tokens() {
        let out = redact_credentials("token ghp_abcdefghijklmnopqrstuvwxyz0123456789 used");
        assert_eq!(out, "token ghp_*** used");
    }

    #[test]
    fn handles_non_ascii() {
        let s = "caf\u{e9} https://tok@github.com/a \u{2713}";
        assert_eq!(redact_credentials(s), "caf\u{e9} https://***@github.com/a \u{2713}");
    }
}
