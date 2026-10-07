#!/usr/bin/env bash
# Install/build/test the isolated renderer using Node 22 when Docker is
# available so engines.node=22 never EBADENGINE on the CI Node 20 runner.
#
# PUPPETEER_SKIP_DOWNLOAD=true: this script's `npm ci` is NOT the renderer
# Dockerfile builder. Without SKIP here, puppeteer's install script may
# download Chromium and invoke unfixed extract-zip (GHSA-jmr9-qjv8-65gv /
# GHSA-7pqw-9j4j-h8q3). build/protocol/API tests do not need a browser
# download; genuine browser-rendering coverage remains in Docker image /
# separate renderer paths that intentionally use Chromium.
set -euo pipefail
root="$(cd "$(dirname "$0")/../.." && pwd)"
service="$root/services/subscription-invoice-renderer"
export PUPPETEER_SKIP_DOWNLOAD=true
if command -v docker >/dev/null 2>&1; then
  docker run --rm \
    -e PUPPETEER_SKIP_DOWNLOAD=true \
    -v "$service:/app" \
    -w /app \
    node:22-bookworm-slim \
    bash -lc 'echo "PUPPETEER_SKIP_DOWNLOAD=${PUPPETEER_SKIP_DOWNLOAD}" && test "${PUPPETEER_SKIP_DOWNLOAD}" = "true" && npm ci && npm run build && npm test'
  exit 0
fi
if [[ "${CI:-}" == "true" ]]; then
  echo "docker is required in CI to install renderer deps on Node 22" >&2
  exit 1
fi
echo "docker not available locally; installing renderer deps on host Node $(node --version) (PUPPETEER_SKIP_DOWNLOAD=${PUPPETEER_SKIP_DOWNLOAD})"
test "${PUPPETEER_SKIP_DOWNLOAD}" = "true"
npm --prefix "$service" ci
npm --prefix "$service" run build
npm --prefix "$service" test
