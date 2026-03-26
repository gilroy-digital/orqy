/// The host root filesystem is mounted at /host inside the container.
/// These helpers translate between host paths (stored in DB, shown to user)
/// and container paths (used for actual file operations).

const HOST_MOUNT: &str = "/host";

/// Convert a host path to a container path.
/// e.g. "/data/apps/myproject" -> "/host/data/apps/myproject"
pub fn host_to_container(host_path: &str) -> String {
    if std::path::Path::new(HOST_MOUNT).exists() {
        format!("{}{}", HOST_MOUNT, host_path)
    } else {
        // Running outside container — paths are direct
        host_path.to_string()
    }
}

/// Convert a container path back to a host path.
/// e.g. "/host/data/apps/myproject" -> "/data/apps/myproject"
pub fn container_to_host(container_path: &str) -> String {
    if let Some(stripped) = container_path.strip_prefix(HOST_MOUNT) {
        if stripped.is_empty() { "/".to_string() } else { stripped.to_string() }
    } else {
        container_path.to_string()
    }
}
