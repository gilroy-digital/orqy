#!/bin/bash
# Self-update script for orqy
# Pulls latest code and rebuilds the container
set -e
cd "$(dirname "$0")"

# The Update button runs this as root on the host (via nsenter), but the
# checkout belongs to whoever cloned it. Git refuses to touch a repo owned by
# another user ("dubious ownership"), and running it as root anyway would leave
# root-owned files in .git that break the next pull by hand. So git runs as the
# checkout's owner, with their SSH keys.
owner="$(stat -c %U .)"
git_as_owner() {
    if [ "$(id -u)" = 0 ] && [ "$owner" != root ]; then
        su "$owner" -s /bin/sh -c "git $*"
    else
        git "$@"
    fi
}

echo "Pulling latest orqy as $owner..."
git_as_owner pull --ff-only origin main

echo "Rebuilding and restarting (no cache)..."
docker compose build --no-cache orqy
docker compose up -d --force-recreate orqy

echo "Orqy updated successfully"
