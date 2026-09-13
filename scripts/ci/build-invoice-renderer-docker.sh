#!/usr/bin/env bash
# Build the subscription invoice renderer image from a clean source tree.
# GitHub Actions provides Docker. Local machines without Docker skip unless CI=true.
set -euo pipefail
root="$(cd "$(dirname "$0")/../.." && pwd)"
service="$root/services/subscription-invoice-renderer"
image="vyd-subscription-invoice-renderer:ci"
if command -v docker >/dev/null 2>&1; then
  docker build -t "$image" "$service"
  runtime="$(docker run --rm --entrypoint node "$image" --version)"
  echo "renderer runtime ${runtime}"
  node -e '
    const { readFileSync } = require("node:fs");
    const pkg = JSON.parse(readFileSync(process.argv[1], "utf8"));
    const declared = String(pkg.engines && pkg.engines.node || "");
    const runtime = String(process.argv[2] || "");
    const major = runtime.replace(/^v/, "").split(".")[0];
    if (!declared) {
      console.error("renderer package.json missing engines.node");
      process.exit(1);
    }
    if (major !== declared) {
      console.error(`renderer runtime ${runtime} does not satisfy engines.node=${declared}`);
      process.exit(1);
    }
  ' "$service/package.json" "$runtime"
  exit 0
fi
if [[ "${CI:-}" == "true" ]]; then
  echo "docker is required to prove a clean renderer image build in CI" >&2
  exit 1
fi
echo "docker not available locally; GitHub Actions CI will run the renderer image build"
exit 0
