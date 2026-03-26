# Orqy

A lightweight deployment orchestrator with a web UI. Detects pushes to a configured branch via polling or webhooks, then automatically pulls, tears down, and rebuilds Docker Compose services.

[![Donate](https://img.shields.io/badge/Donate-Support%20Development-pink?style=for-the-badge&logo=stripe)](https://donate.stripe.com/dRm5kDgAk6mB4sw9sYfbq06)

## Requirements

Each project managed by Orqy needs:

- A **Git repository** (GitHub, GitLab, or any HTTPS git remote)
- A **Docker Compose file** in the repo
- **Docker** running on the host

## Quick Start

```bash
# Clone and start
git clone https://github.com/Fleebee/orqy.git
cd orqy
docker compose up -d

# Open the UI
open http://localhost:3456
```

On first launch, you'll be guided through setup — create an admin account and select your host OS.

## Features

- **Guided setup**: First-boot wizard with OS detection and account creation
- **Authentication**: Username/password login with session management
- **Dual detection**: Polling (configurable per-project interval) + GitHub/GitLab webhooks
- **Encrypted PATs**: AES-256-GCM encrypted at rest, global + per-project override
- **Real-time logs**: WebSocket streaming of build output as it happens
- **Deploy history**: Full log retention per deploy with trigger type tracking
- **Manual deploys**: One-click deploy from the UI
- **Multi-project**: Single service manages unlimited projects
- **File browser**: Browse host filesystem to select project paths and compose files
- **Branch picker**: Auto-fetches available branches from the remote
- **Service picker**: Auto-detects services from Docker Compose files
- **Edit projects**: Update any project configuration after creation

## Architecture

- **Rust backend** (Axum) — REST API, WebSocket log streaming, polling engine, webhook receiver
- **React SPA** — Project dashboard, deploy logs viewer, settings
- **PostgreSQL** — Project config, encrypted PATs, deploy history + logs

## Adding a Project

1. Set a global PAT in **Settings** (or add one per project)
2. Click **Add Project** and enter the repository URL
3. Click **Validate** to verify access and load branches
4. Select the branch to watch
5. Browse to the local path where the repo lives (or clone it from the UI)
6. Select the Docker Compose file and optionally a specific service
7. Configure polling interval and auto-deploy preferences

## Webhook Setup

Each project gets a unique webhook URL shown on its detail page:

```
http://your-server:3456/api/webhook/<project-id>
```

In GitHub: Settings > Webhooks > Add webhook > Paste URL > Content type: `application/json`

## Deploy Flow

When a change is detected (poll or webhook):

1. `git fetch <authenticated-url> <branch>`
2. `git reset --hard FETCH_HEAD`
3. `docker compose -f <file> down --remove-orphans`
4. `docker compose -f <file> up -d --build --force-recreate [service]`

All output is captured, stored, and streamed live via WebSocket.

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `ENCRYPTION_SECRET` | `change-me-in-production` | Key for encrypting PATs |
| `HOST_MOUNT` | `/Users` | Host path to mount (Mac: `/Users`, Windows: `/c/Users`, Linux: `/home`) |
| `PORT` | `3456` | HTTP server port |
| `RUST_LOG` | `orqy=info` | Log level |

## Development

```bash
# Backend
cargo run

# Frontend (separate terminal)
cd frontend && npm install && npm run dev
```

## License

This project is licensed under [AGPL-3.0](LICENSE). Free to use, modify, and distribute — but any modifications or services built on it must also be open-sourced under the same license.

## Author

**Leon Gilroy** — [Gilroy.digital](https://gilroy.digital)

Check out more open source tools at [gilroy.digital/tools](https://gilroy.digital/tools)

[![Donate](https://img.shields.io/badge/Donate-Support%20Development-pink?logo=stripe)](https://donate.stripe.com/dRm5kDgAk6mB4sw9sYfbq06)
