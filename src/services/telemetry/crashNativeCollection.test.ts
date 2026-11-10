/**
 * Preference and running SDK collection are separate fields.
 * A setter that flips both is not the production path under test.
 * Not a signed-device run.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  __resetCrashSdkBridgeForTests,
  __setCrashSdkBridgeForTests,
  nextProcessCrashCollectionEnabled,
  writeAutoCollectionPreferenceFalse,
} from "./crashNativeCollection";
import {
  __resetCrashReportingForTests,
  __setCrashlyticsClientForTests,
  recordError,
  setCrashReportingEnabled,
} from "./crashReporter";

function installDouble(bridge: "present" | "absent" | "fail") {
  const snap = {
    preference: true,
    sdkCollection: false,
    unsentDeletion: "none" as "none" | "requested",
  };
  __setCrashlyticsClientForTests({
    setCrashlyticsCollectionEnabled: async (enabled) => {
      snap.preference = enabled;
    },
    deleteUnsentReports: async () => {
      snap.unsentDeletion = "requested";
    },
    log: () => undefined,
    recordError: () => undefined,
    setUserId: () => undefined,
  });
  if (bridge === "absent") {
    __setCrashSdkBridgeForTests(null);
  } else {
    __setCrashSdkBridgeForTests({
      setSdkCollectionEnabled: async (enabled) => {
        if (bridge === "fail" && enabled) throw new Error("bridge rejected");
        snap.sdkCollection = enabled;
      },
      deleteUnsentReports: async () => {
        snap.unsentDeletion = "requested";
      },
      recordDiagnostic: async () => undefined,
      logDiagnostic: async () => undefined,
    });
  }
  return snap;
}

async function main(): Promise<void> {
  const strip = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  const here = dirname(fileURLToPath(import.meta.url));
  const adapterRaw = readFileSync(resolve(here, "crashNativeCollection.ts"), "utf8");
  const reporter = strip(readFileSync(resolve(here, "crashReporter.ts"), "utf8"));
  const adapter = strip(adapterRaw);
  assert.doesNotMatch(reporter, /setCrashlyticsCollectionEnabled\(\s*true\s*\)/);
  assert.doesNotMatch(reporter, /sendUnsentReports/);
  assert.doesNotMatch(adapter, /sendUnsentReports/);
  assert.match(adapterRaw, /Signed-device checks — NOT RUN/);
  assert.match(adapterRaw, /Force-stop, then relaunch, stays disabled until Allow again/);

  assert.equal(
    nextProcessCrashCollectionEnabled({ preference: false, firebaseJson: true, manifest: true }),
    false
  );
  assert.equal(
    nextProcessCrashCollectionEnabled({ preference: null, firebaseJson: false, manifest: null }),
    false
  );
  assert.equal(
    nextProcessCrashCollectionEnabled({ preference: true, firebaseJson: false, manifest: false }),
    true,
    "a stored true would enable the next process, which is why production never writes it"
  );

  __resetCrashReportingForTests();
  const missing = installDouble("absent");
  let rnReports = 0;
  let bridgeReports = 0;
  __setCrashlyticsClientForTests({
    setCrashlyticsCollectionEnabled: async (enabled) => {
      missing.preference = enabled;
    },
    log: () => undefined,
    recordError: () => {
      rnReports += 1;
    },
    setUserId: () => undefined,
  });
  const unavailable = await setCrashReportingEnabled(true);
  assert.equal(unavailable.status, "unavailable");
  assert.equal(unavailable.sdkCollection, false);
  assert.equal(unavailable.preference, false);
  assert.equal(missing.preference, false);
  assert.equal(missing.sdkCollection, false);
  recordError(new Error("synthetic"));
  assert.equal(rnReports, 0);
  assert.equal(bridgeReports, 0);

  __resetCrashReportingForTests();
  const ready = installDouble("present");
  __setCrashSdkBridgeForTests({
    setSdkCollectionEnabled: async (enabled) => {
      ready.sdkCollection = enabled;
    },
    deleteUnsentReports: async () => {
      ready.unsentDeletion = "requested";
    },
    recordDiagnostic: async () => {
      bridgeReports += 1;
    },
    logDiagnostic: async () => undefined,
  });
  const enabled = await setCrashReportingEnabled(true);
  assert.equal(enabled.status, "enabled");
  assert.equal(enabled.sdkCollection, true);
  assert.equal(enabled.preference, false);
  assert.equal(ready.sdkCollection, true);
  assert.equal(ready.preference, false);
  recordError(new Error("synthetic"));
  assert.equal(bridgeReports, 1);
  assert.equal(rnReports, 0);

  const withdrawn = await setCrashReportingEnabled(false, { deleteUnsentReports: true });
  assert.equal(withdrawn.status, "disabled");
  assert.equal(withdrawn.unsentReports, "deletion_requested");
  assert.notEqual(withdrawn.unsentReports, "deleted");
  assert.equal(ready.sdkCollection, false);
  assert.equal(ready.preference, false);
  assert.equal(ready.unsentDeletion, "requested");

  __resetCrashReportingForTests();
  const failing = installDouble("fail");
  const rejected = await setCrashReportingEnabled(true);
  assert.equal(rejected.status, "rejected");
  assert.equal(rejected.sdkCollection, false);
  assert.equal(failing.preference, false);
  assert.equal(failing.sdkCollection, false);

  let sawTrue = false;
  await writeAutoCollectionPreferenceFalse({
    setCrashlyticsCollectionEnabled: async (enabled) => {
      if (enabled) sawTrue = true;
    },
  });
  assert.equal(sawTrue, false);

  __resetCrashSdkBridgeForTests();
  __resetCrashReportingForTests();
  console.log("crashNativeCollection.test.ts: ok (not a signed-device run)");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
