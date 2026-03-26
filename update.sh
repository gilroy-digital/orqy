#!/bin/bash
# Self-update script for orqy
# Pulls latest code and rebuilds the container
set -e
cd "$(dirname "$0")"

echo "Pulling latest orqy..."
git pull origin main

echo "Rebuilding and restarting (no cache)..."
docker compose build --no-cache orqy
docker compose up -d --force-recreate orqy

echo "Orqy updated successfully"
