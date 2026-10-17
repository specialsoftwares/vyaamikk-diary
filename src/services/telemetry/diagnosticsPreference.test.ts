import assert from "node:assert/strict";

import { __resetCrashReportingForTests, __setCrashlyticsClientForTests } from "./crashReporter";
import {
  applyDiagnosticsChoice,
  currentDiagnosticsPreference,
  loadDiagnosticsPreference,
  resetDiagnosticsPreferenceForTests,
  runCrashReportingBridge,
} from "./diagnosticsPreference";

const writes: boolean[] = [];
let failWrite = false;

async function main(): Promise<void> {
  const storage = await import("@react-native-async-storage/async-storage");
  const original = storage.default.setItem.bind(storage.default);
  storage.default.setItem = async (_key: string, value: string) => {
    if (failWrite) throw new Error("disk");
    writes.push(value === "true");
  };

  __setCrashlyticsClientForTests({
    setCrashlyticsCollectionEnabled: async () => undefined,
    log: () => undefined,
    recordError: () => undefined,
    setUserId: () => undefined,
  });
  resetDiagnosticsPreferenceForTests();

  failWrite = true;
  const failedOff = await applyDiagnosticsChoice(false);
  assert.equal(failedOff.desired, "off");
  assert.equal(failedOff.persisted, false);
  assert.equal(failedOff.nativeState, "error");
  assert.equal(currentDiagnosticsPreference().nativeState, "error");

  failWrite = false;
  const savedOn = await applyDiagnosticsChoice(true);
  assert.equal(savedOn.persisted, true);
  assert.equal(savedOn.desired, "on");
  assert.equal(writes.at(-1), true);

  failWrite = true;
  const failedOn = await applyDiagnosticsChoice(true);
  assert.equal(failedOn.desired, "on");
  assert.equal(failedOn.persisted, false);
  assert.equal(failedOn.nativeState, "error");

  const enabledCalls: boolean[] = [];
  __setCrashlyticsClientForTests({
    setCrashlyticsCollectionEnabled: async (enabled: boolean) => {
      enabledCalls.push(enabled);
    },
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
  const turnOn = applyDiagnosticsChoice(true);
  const turnOff = applyDiagnosticsChoice(false);
  resolveWrite(true);
  await turnOn;
  await turnOff;
  assert.equal(currentDiagnosticsPreference().desired, "off");
  assert.equal(writes.at(-1), false);
  storage.default.getItem = async () => "false";
  const reread = await loadDiagnosticsPreference();
  assert.equal(reread.desired, "off");

  storage.default.getItem = originalGet;
  storage.default.setItem = original;
  __resetCrashReportingForTests();
  resetDiagnosticsPreferenceForTests();
  console.log("diagnosticsPreference.test.ts: ok");
}

void main();
