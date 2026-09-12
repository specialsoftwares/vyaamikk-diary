#!/usr/bin/env bash
# Build the subscription invoice renderer image from a clean source tree.
# GitHub Actions provides Docker. Local machines without Docker skip unless CI=true.
set -euo pipefail
root="$(cd "$(dirname "$0")/../.." && pwd)"
if command -v docker >/dev/null 2>&1; then
  docker build -t vyd-subscription-invoice-renderer:ci "$root/services/subscription-invoice-renderer"
  exit 0
fi
if [[ "${CI:-}" == "true" ]]; then
  echo "docker is required to prove a clean renderer image build in CI" >&2
  exit 1
fi
echo "docker not available locally; GitHub Actions CI will run the renderer image build"
exit 0
