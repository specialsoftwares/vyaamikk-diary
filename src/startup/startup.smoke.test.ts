/**
 * Release-bootstrap smoke: coordinator returns a structured outcome and
 * failure diagnostics are safe to render (no secrets).
 */
import assert from "node:assert/strict";

import { runStartupCoordinator } from "./coordinator";
import { formatDiagnosticsPlainText } from "./diagnostics";
import { __setRuntimeSignalsForTests } from "@/config/env";

async function main() {
  process.env.EXPO_PUBLIC_APP_MODE = "production";
  __setRuntimeSignalsForTests({
    appOwnership: "standalone",
    isDev: false,
    platform: "android",
  });

  try {
    const outcome = await runStartupCoordinator({ skipNativeSideEffects: true });
    assert.ok(outcome);
    assert.equal(typeof outcome.ok, "boolean");

    if (outcome.ok) {
      assert.ok(outcome.checkpoints.includes("CONFIG_LOADED"));
      assert.ok(outcome.checkpoints.includes("ROUTER_READY"));
      assert.ok(
        outcome.diagnostics.backend === "firebase-production",
        `expected firebase-production on success, got ${outcome.diagnostics.backend}`
      );
      assert.equal(outcome.diagnostics.appMode, "production");
    } else {
      const text = formatDiagnosticsPlainText(outcome.diagnostics);
      assert.ok(text.includes("Startup Diagnostics"));
      assert.ok(text.includes(`errorCode=${outcome.diagnostics.errorCode}`));
      assert.doesNotMatch(text, /AIza[0-9A-Za-z_-]{8,}/);
      assert.doesNotMatch(text, /eyJ[A-Za-z0-9_-]+\./);
      // Fail-closed but contained — never an uncaught throw.
      assert.ok(outcome.diagnostics.errorCode.length > 0);
    }
  } finally {
    __setRuntimeSignalsForTests(null);
  }

  console.log("startup.smoke.test.ts: ok");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
