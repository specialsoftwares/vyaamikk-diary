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
    sessionReporting: false,
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
      setSessionReportingEnabled: async (enabled) => {
        if (bridge === "fail" && enabled) throw new Error("bridge rejected");
        snap.sessionReporting = enabled;
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
  assert.match(adapterRaw, /Signed-device startup\/upgrade\/withdrawal checks — NOT RUN/);


  assert.equal(nextProcessCrashCollectionEnabled({ sdkOverride: true, preference: false, firebaseJson: false, manifest: false }), true,
    "SDK override survives independently of RNFirebase preference; bootstrap must migrate it before SDK init");
  assert.equal(nextProcessCrashCollectionEnabled({ sdkOverride: false, preference: true, firebaseJson: true, manifest: true }), false,
    "the guarded bootstrap reset is the SDK startup gate");
  assert.equal(nextProcessCrashCollectionEnabled({ sdkOverride: null, preference: false, firebaseJson: false, manifest: false }), false);

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
  assert.equal(unavailable.sessionReporting, false);
  assert.equal(unavailable.preference, false);
  assert.equal(missing.preference, false);
  assert.equal(missing.sessionReporting, false);
  recordError(new Error("synthetic"));
  assert.equal(rnReports, 0);
  assert.equal(bridgeReports, 0);

  __resetCrashReportingForTests();
  const ready = installDouble("present");
  __setCrashSdkBridgeForTests({
    setSessionReportingEnabled: async (enabled) => {
      ready.sessionReporting = enabled;
    },
    deleteUnsentReports: async () => {
      ready.unsentDeletion = "requested";
    },
    recordDiagnostic: async () => {
      bridgeReports += 1;
    },
    logDiagnostic: async () => undefined,
  });
  let scoped: unknown[] = [];
  __setCrashSdkBridgeForTests({
    setSessionReportingEnabled: async (on, uid, revision) => { ready.sessionReporting = on; scoped = [uid, revision]; },
    deleteUnsentReports: async () => { ready.unsentDeletion = "requested"; },
    recordDiagnostic: async () => { bridgeReports += 1; },
  });
  const enabled = await setCrashReportingEnabled(true, { ownerUid: "synthetic-owner", consentRevision: 7 });
  assert.deepEqual(scoped, ["synthetic-owner", 7]);
  assert.equal(enabled.status, "enabled");
  assert.equal(enabled.sessionReporting, true);
  assert.equal(enabled.preference, false);
  assert.equal(ready.sessionReporting, true);
  assert.equal(ready.preference, false);
  recordError(new Error("synthetic"));
  assert.equal(bridgeReports, 1);
  assert.equal(rnReports, 0);

  const withdrawn = await setCrashReportingEnabled(false, { deleteUnsentReports: true });
  assert.equal(withdrawn.status, "disabled");
  assert.equal(withdrawn.unsentReports, "deletion_requested");
  assert.notEqual(withdrawn.unsentReports, "deleted");
  assert.equal(ready.sessionReporting, false);
  assert.equal(ready.preference, false);
  assert.equal(ready.unsentDeletion, "requested");

  __resetCrashReportingForTests();
  const failing = installDouble("fail");
  const rejected = await setCrashReportingEnabled(true);
  assert.equal(rejected.status, "rejected");
  assert.equal(rejected.sessionReporting, false);
  assert.equal(failing.preference, false);
  assert.equal(failing.sessionReporting, false);

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
