#!/usr/bin/env bash
# Install/build/test the isolated renderer using Node 22 when Docker is
# available so engines.node=22 never EBADENGINE on the CI Node 20 runner.
set -euo pipefail
root="$(cd "$(dirname "$0")/../.." && pwd)"
service="$root/services/subscription-invoice-renderer"
if command -v docker >/dev/null 2>&1; then
  docker run --rm \
    -v "$service:/app" \
    -w /app \
    node:22-bookworm-slim \
    bash -lc "npm ci && npm run build && npm test"
  exit 0
fi
if [[ "${CI:-}" == "true" ]]; then
  echo "docker is required in CI to install renderer deps on Node 22" >&2
  exit 1
fi
echo "docker not available locally; installing renderer deps on host Node $(node --version)"
npm --prefix "$service" ci
npm --prefix "$service" run build
npm --prefix "$service" test
