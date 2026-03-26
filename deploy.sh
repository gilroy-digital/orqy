#!/bin/bash
set -e
cd "$(dirname "$0")"
docker compose down --remove-orphans
docker compose build --no-cache
docker compose up -d
