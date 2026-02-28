#!/bin/bash
# Rebuild CLI and restart admin panel
set -e
cd "$(dirname "$0")/.."

echo "==> Building CLI..."
cd packages/cli && pnpm run build && cd ../..

echo "==> Stopping admin server..."
kill -9 $(lsof -t -i :8088) 2>/dev/null || true

# Wait until port is free
for i in 1 2 3 4 5; do
  lsof -i :8088 -P 2>/dev/null | grep -q LISTEN || break
  sleep 1
done

echo "==> Starting admin server..."
exec node packages/cli/dist/index.js admin
