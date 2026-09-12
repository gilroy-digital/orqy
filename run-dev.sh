#!/bin/bash
# Local development launcher.
#
# Brings up the dev Postgres (docker-compose.dev.yml), then runs the Rust
# backend and the Vite frontend natively on the host. Ctrl-C stops both;
# the database keeps running (stop it with ./run-dev.sh --stop).
#
# Ports (registered in ~/coding/PORTS.md):
#   3457  backend  (cargo run)
#   3458  frontend (vite — open this one)
#   5443  postgres (orqy_dev_db)
set -e
cd "$(dirname "$0")"

if [ "$1" = "--stop" ]; then
    docker compose -f docker-compose.dev.yml down
    exit 0
fi

if [ ! -f .env ]; then
    echo "No .env found — copying .env.example"
    cp .env.example .env
fi
set -a; . ./.env; set +a

echo "==> Starting dev database (orqy_dev_db on 5443)..."
docker compose -f docker-compose.dev.yml up -d

echo -n "==> Waiting for Postgres"
for i in $(seq 1 30); do
    if docker exec orqy_dev_db pg_isready -U orqy >/dev/null 2>&1; then
        echo " ready"
        break
    fi
    echo -n "."
    sleep 1
    if [ "$i" = 30 ]; then echo " timed out"; exit 1; fi
done

if [ ! -d frontend/node_modules ]; then
    echo "==> Installing frontend deps..."
    (cd frontend && npm install)
fi

pids=""
cleanup() {
    echo ""
    echo "==> Shutting down (database left running — ./run-dev.sh --stop to remove)"
    # shellcheck disable=SC2086
    [ -n "$pids" ] && kill $pids 2>/dev/null
    wait 2>/dev/null
}
trap cleanup EXIT INT TERM

echo "==> Starting backend on :${PORT:-3457}..."
cargo run &
pids="$pids $!"

echo "==> Starting frontend on :3458..."
(cd frontend && npm run dev) &
pids="$pids $!"

echo ""
echo "  UI:      http://localhost:3458"
echo "  API:     http://localhost:3457/api"
echo "  DB:      postgres://orqy:orqy@localhost:5443/orqy"
echo ""

wait
