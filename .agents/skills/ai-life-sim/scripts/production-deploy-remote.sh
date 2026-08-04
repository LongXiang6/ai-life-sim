#!/usr/bin/env bash
# Purpose: Replace production project files in place, rebuild, and restart PM2.
# Owner: production-deployment
# Responsibility: Single remote execution path without release versions or rollback state.

set -euo pipefail

archive="${1:?project archive is required}"
active=/root/ai-life-sim
script_path="$0"

[[ "$archive" =~ ^/tmp/ai-life-sim-deploy-[0-9a-f]{32}\.tar\.gz$ ]]
[[ "$script_path" =~ ^/tmp/ai-life-sim-deploy-[0-9a-f]{32}\.sh$ ]]
test -f "$archive"

cleanup() {
  rm -f -- "$archive" "$script_path"
}
trap cleanup EXIT

for required_command in find npm pm2 rm tar; do
  command -v "$required_command" >/dev/null 2>&1 || {
    echo "DEPLOY_FAILED missing_command=$required_command" >&2
    exit 69
  }
done

if [[ ! -d "$active" || -L "$active" ]]; then
  echo "DEPLOY_FAILED invalid_active_directory=$active" >&2
  exit 65
fi

test -d "$active/node_modules"
test -f "$active/.env.production.local"

find "$active" -mindepth 1 -maxdepth 1 \
  ! -name node_modules \
  ! -name .env.production.local \
  -exec rm -rf -- {} +

tar --no-same-owner --exclude=node_modules --exclude=.env.production.local -xzf "$archive" -C "$active"
rm -f -- "$archive"

cd "$active"
npm run build
pm2 restart ai-life-sim --update-env

echo "DEPLOY_OK path=$active"
