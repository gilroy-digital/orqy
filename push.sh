#!/bin/bash
set -e
cd "$(dirname "$0")"
msg="${1:-update}"
git add -A
git commit -m "$msg"
git push origin main
