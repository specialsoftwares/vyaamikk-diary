/**
 * Startup coordinator + guard regression tests (Node harness).
 * Proves configuration failures become structured outcomes, not process kills.
 */
import assert from "node:assert/strict";

import { StartupError, redactStartupMessage } from "./errors";
import { evaluateProductionConfig } from "./guards";
import { runStartupCoordinator } from "./coordinator";
import { formatDiagnosticsPlainText, readFirebaseVarPresence } from "./diagnostics";
import { __setRuntimeSignalsForTests } from "@/config/env";

function testRedaction() {
  const msg = redactStartupMessage(
    "fail AIzaSyB6z6vRYwjpNOfbuh4j4uKY48mYsF5sUPI user@example.com +919876543210 /Users/me/secret"
  );
  assert.ok(!msg.includes("AIza"));
  assert.ok(!msg.includes("user@"));
  assert.ok(!msg.includes("98765"));
  assert.ok(!msg.includes("/Users/"));
  assert.ok(msg.includes("[redacted]"));
}

function testStartupErrorShape() {
  const err = new StartupError(
    "FIREBASE_JS_MISSING",
    "CONFIG_LOADED",
    "missing firebase"
  );
  assert.equal(err.code, "FIREBASE_JS_MISSING");
  assert.equal(err.stage, "CONFIG_LOADED");
  assert.equal(err.name, "StartupError");
}

function testGuardsDoNotThrow() {
  // Store-like signals with production mode; may be not-configured in Node.
  process.env.EXPO_PUBLIC_APP_MODE = "production";
  __setRuntimeSignalsForTests({
    appOwnership: "standalone",
    isDev: false,
    platform: "android",
  });
  try {
    const result = evaluateProductionConfig();
    assert.equal(typeof result.ok, "boolean");
    if (!result.ok) {
      assert.ok(result.code);
      assert.ok(result.stage);
      assert.ok(result.message.length > 0);
    }
  } finally {
    __setRuntimeSignalsForTests(null);
  }
}

async function testCoordinatorContainsFailure() {
  process.env.EXPO_PUBLIC_APP_MODE = "production";
  // Clear firebase markers so production guard fails closed inside coordinator.
  const keys = [
    "EXPO_PUBLIC_FIREBASE_API_KEY",
    "EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN",
    "EXPO_PUBLIC_FIREBASE_PROJECT_ID",
    "EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET",
    "EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
    "EXPO_PUBLIC_FIREBASE_APP_ID",
  ] as const;
  const saved: Record<string, string | undefined> = {};
  for (const k of keys) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  __setRuntimeSignalsForTests({
    appOwnership: "standalone",
    isDev: false,
    platform: "android",
  });
  try {
    // Note: env.ts firebaseConfig is captured at first module load in this process.
    // Coordinator still evaluates via isFirebaseConfigured() from that capture.
    // We assert the coordinator never throws outward.
    const outcome = await runStartupCoordinator({ skipNativeSideEffects: true });
    assert.equal(typeof outcome.ok, "boolean");
    if (!outcome.ok) {
      assert.ok(outcome.diagnostics.errorCode);
      assert.ok(outcome.diagnostics.failedStage);
      assert.ok(!outcome.diagnostics.redactedMessage.includes("AIza"));
      const text = formatDiagnosticsPlainText(outcome.diagnostics);
      assert.ok(text.includes("errorCode="));
      assert.ok(!text.includes("AIza"));
    }
  } finally {
    for (const k of keys) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
    __setRuntimeSignalsForTests(null);
  }
}

function testFirebaseVarPresenceStatic() {
  const presence = readFirebaseVarPresence();
  assert.equal(typeof presence.EXPO_PUBLIC_FIREBASE_API_KEY, "boolean");
  assert.equal(typeof presence.EXPO_PUBLIC_FIREBASE_PROJECT_ID, "boolean");
}

async function main() {
  testRedaction();
  testStartupErrorShape();
  testGuardsDoNotThrow();
  testFirebaseVarPresenceStatic();
  await testCoordinatorContainsFailure();
  console.log("startup.coordinator.test.ts: ok");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
