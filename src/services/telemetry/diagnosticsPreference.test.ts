import assert from "node:assert/strict";

import { __resetCrashReportingForTests, __setCrashlyticsClientForTests, __setCrashSdkBridgeForTests } from "./crashReporter";
import {
  applyDiagnosticsChoice,
  currentDiagnosticsPreference,
  loadDiagnosticsPreference,
  resetDiagnosticsPreferenceForTests,
  runCrashReportingBridge,
} from "./diagnosticsPreference";

const writes: boolean[] = [];
let failWrite = false;
const SCOPE = { ownerUid: "diagnostics-fixture-owner", consentRevision: 1 };
let sessionReporting = false;
const preferenceWrites: boolean[] = [];

function installBridge() {
  __setCrashSdkBridgeForTests({
    setSessionReportingEnabled: async (enabled, ownerUid, revision) => {
      if (enabled) {
        assert.equal(ownerUid, SCOPE.ownerUid);
        assert.equal(revision, SCOPE.consentRevision);
      }
      sessionReporting = enabled;
    },
    deleteUnsentReports: async () => {},
    recordDiagnostic: () => {}, logDiagnostic: () => {},
  });
}

async function main(): Promise<void> {
  const storage = await import("@react-native-async-storage/async-storage");
  const original = storage.default.setItem.bind(storage.default);
  storage.default.setItem = async (_key: string, value: string) => {
    if (failWrite) throw new Error("disk");
    writes.push(value === "true");
  };

  __setCrashlyticsClientForTests({
    setCrashlyticsCollectionEnabled: async (enabled) => {
      preferenceWrites.push(enabled);
      assert.equal(enabled, false);
    },
    deleteUnsentReports: async () => undefined,
    log: () => undefined,
    recordError: () => undefined,
    setUserId: () => undefined,
  });
  installBridge();
  resetDiagnosticsPreferenceForTests();

  failWrite = true;
  const failedOff = await applyDiagnosticsChoice(false);
  assert.equal(failedOff.desired, "off");
  assert.equal(failedOff.persisted, false);
  assert.equal(failedOff.nativeState, "error");
  assert.equal(currentDiagnosticsPreference().nativeState, "error");

  failWrite = false;
  const savedOn = await applyDiagnosticsChoice(true, SCOPE);
  assert.equal(savedOn.persisted, true);
  assert.equal(savedOn.desired, "on");
  assert.equal(writes.at(-1), true);
  assert.equal(savedOn.nativeState, "on");
  assert.equal(savedOn.sessionReporting, true);
  assert.equal(savedOn.preference, false);
  assert.equal(sessionReporting, true);
  assert.equal(preferenceWrites.includes(true), false);

  failWrite = true;
  const failedOn = await applyDiagnosticsChoice(true, SCOPE);
  assert.equal(failedOn.desired, "on");
  assert.equal(failedOn.persisted, false);
  assert.equal(failedOn.nativeState, "error");

  const enabledCalls: boolean[] = [];
  __setCrashlyticsClientForTests({
    setCrashlyticsCollectionEnabled: async (enabled: boolean) => {
      enabledCalls.push(enabled);
    },
    deleteUnsentReports: async () => undefined,
    log: () => undefined,
    recordError: () => undefined,
    setUserId: () => undefined,
  });
  resetDiagnosticsPreferenceForTests();
  let releaseRead: (value: string | null) => void = () => undefined;
  const originalGet = storage.default.getItem.bind(storage.default);
  storage.default.getItem = () =>
    new Promise((resolve) => {
      releaseRead = resolve;
    });
  failWrite = true;
  const bridge = runCrashReportingBridge();
  await Promise.resolve();
  const optOut = applyDiagnosticsChoice(false);
  releaseRead("true");
  await bridge;
  const failedOptOut = await optOut;
  assert.equal(failedOptOut.desired, "off");
  assert.equal(failedOptOut.persisted, false);
  assert.equal(currentDiagnosticsPreference().desired, "off");
  assert.equal(enabledCalls.at(-1), false);
  assert.equal(enabledCalls.includes(true), false);

  failWrite = false;
  let resolveWrite: (value: boolean) => void = () => undefined;
  const writeGate = new Promise<boolean>((resolve) => {
    resolveWrite = resolve;
  });
  storage.default.setItem = async (_key: string, value: string) => {
    const allow = await writeGate;
    if (!allow) throw new Error("disk");
    writes.push(value === "true");
  };
  resetDiagnosticsPreferenceForTests();
  const turnOn = applyDiagnosticsChoice(true, SCOPE);
  const turnOff = applyDiagnosticsChoice(false);
  resolveWrite(true);
  await turnOn;
  await turnOff;
  assert.equal(currentDiagnosticsPreference().desired, "off");
  assert.equal(writes.at(-1), false);
  storage.default.getItem = async () => "false";
  const reread = await loadDiagnosticsPreference();
  assert.equal(reread.desired, "off");

  // Persisting an opt-in or writing the SDK preference false is not proof that
  // the native session can collect sanitized reports.
  __setCrashSdkBridgeForTests(null);
  resetDiagnosticsPreferenceForTests();
  const missingBridge = await applyDiagnosticsChoice(true, SCOPE);
  assert.equal(missingBridge.persisted, true);
  assert.equal(missingBridge.nativeState, "unavailable");
  assert.equal(missingBridge.sessionReporting, false);
  assert.equal(missingBridge.preference, false);

  __setCrashlyticsClientForTests(null);
  resetDiagnosticsPreferenceForTests();
  const missingSdk = await applyDiagnosticsChoice(true, SCOPE);
  assert.equal(missingSdk.persisted, true);
  assert.equal(missingSdk.desired, "on");
  assert.equal(missingSdk.nativeState, "unavailable");
  assert.notEqual(missingSdk.nativeState, "next_launch");

  __setCrashSdkBridgeForTests({
    setSessionReportingEnabled: async () => { throw new Error("native rejected"); },
    deleteUnsentReports: async () => { throw new Error("native rejected"); },
  });
  __setCrashlyticsClientForTests({
    setCrashlyticsCollectionEnabled: async (enabled) => { assert.equal(enabled, false); },
    log: () => undefined,
    recordError: () => undefined,
    setUserId: () => undefined,
  });
  resetDiagnosticsPreferenceForTests();
  const rejectedSdk = await applyDiagnosticsChoice(true, SCOPE);
  assert.equal(rejectedSdk.persisted, true);
  assert.equal(rejectedSdk.desired, "on");
  assert.equal(rejectedSdk.nativeState, "error");
  assert.equal(rejectedSdk.error, "activation_failed");
  const withdrawn = await applyDiagnosticsChoice(false);
  assert.equal(withdrawn.desired, "off");
  assert.equal(withdrawn.nativeState, "error");
  assert.equal(withdrawn.unsentReports, "error");

  storage.default.getItem = originalGet;
  storage.default.setItem = original;
  __resetCrashReportingForTests();
  resetDiagnosticsPreferenceForTests();
  console.log("diagnosticsPreference.test.ts: ok");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
