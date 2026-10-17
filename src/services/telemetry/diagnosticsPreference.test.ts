import assert from "node:assert/strict";

import { __resetCrashReportingForTests, __setCrashlyticsClientForTests } from "./crashReporter";
import {
  applyDiagnosticsChoice,
  currentDiagnosticsPreference,
  resetDiagnosticsPreferenceForTests,
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

  storage.default.setItem = original;
  __resetCrashReportingForTests();
  resetDiagnosticsPreferenceForTests();
  console.log("diagnosticsPreference.test.ts: ok");
}

void main();
