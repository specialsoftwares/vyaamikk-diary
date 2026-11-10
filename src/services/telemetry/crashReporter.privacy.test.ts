/**
 * Executed production crashReporter methods with an injected Crashlytics port.
 * Label: EXECUTED_PRODUCTION_METHOD (injected port — not native consent)
 */
import assert from "node:assert/strict";

import {
  __resetCrashReportingForTests,
  __setCrashSdkBridgeForTests,
  __setCrashlyticsClientForTests,
  log,
  recordError,
  setCrashReportingEnabled,
} from "./crashReporter";

const EMAIL = "alice.reviewer@example.invalid";
const DOC = "WIDGET-BATCH-Q7-LEDGER";

function assertClean(value: unknown): void {
  const blob = JSON.stringify(value);
  assert.doesNotMatch(blob, /alice\.reviewer@example\.invalid/);
  assert.doesNotMatch(blob, /WIDGET-BATCH-Q7-LEDGER/);
  assert.doesNotMatch(blob, /SYNTHETIC_VALUE_Q7/);
}

async function main(): Promise<void> {
__resetCrashReportingForTests();

{
  const calls: { kind: string; payload: unknown }[] = [];
  const preferenceWrites: boolean[] = [];
  let rnRecords = 0;
  __setCrashlyticsClientForTests({
    setCrashlyticsCollectionEnabled: async (enabled) => {
      preferenceWrites.push(enabled);
    },
    log: () => {
      rnRecords += 1;
    },
    recordError: () => {
      rnRecords += 1;
    },
    setUserId: () => {},
  });
  __setCrashSdkBridgeForTests({
    setSessionReportingEnabled: async () => {},
    recordDiagnostic: async (message) => {
      calls.push({ kind: "recordError", payload: message });
    },
    logDiagnostic: async (message) => {
      calls.push({ kind: "log", payload: message });
    },
  });

  const original = Object.assign(new Error(`enabled path ${EMAIL} ${DOC}`), {
    customData: { email: EMAIL, invoice: DOC },
  });
  const cause = new Error(`cause ${DOC}`);
  (original as Error & { cause?: Error }).cause = cause;

  recordError(original, `ErrorBoundary ${EMAIL} ${DOC}`);
  log(`invoice ${DOC} ${EMAIL}`);
  assert.equal(calls.length, 0, "disabled reporting forwards nothing");
  assert.equal(original.message.includes(EMAIL), true);
  assert.equal(original.cause, cause);

  await setCrashReportingEnabled(true);
  recordError(original, "ErrorBoundary");
  log(`invoice ${DOC} ${EMAIL}`);

  assert.ok(calls.some((row) => row.kind === "log" && row.payload === "ErrorBoundary"));
  assert.ok(calls.some((row) => row.kind === "log" && row.payload === "app"));
  const recorded = calls.filter((row) => row.kind === "recordError");
  assert.equal(recorded.length, 1);
  assert.equal(recorded[0]!.payload, "SafeDiagnosticError:diagnostic:unknown");
  assertClean(calls);
  assert.equal(rnRecords, 0, "RNFirebase record and log stay unused while the preference is false");
  assert.equal(original.message.includes(EMAIL), true, "original Error unchanged");
  assert.equal((original as { customData?: { email?: string } }).customData?.email, EMAIL);
  assert.equal(preferenceWrites.includes(true), false);
  assert.equal(preferenceWrites.at(-1), false);
}

{
  __resetCrashReportingForTests();
  __setCrashlyticsClientForTests(null);
  await setCrashReportingEnabled(true);
  assert.doesNotThrow(() =>
    recordError(new Error(`missing sdk ${EMAIL}`), "ErrorBoundary")
  );
}

{
  __resetCrashReportingForTests();
  __setCrashlyticsClientForTests({
    setCrashlyticsCollectionEnabled: async () => {
      throw new Error(`native enable ${EMAIL}`);
    },
    log: () => {
      throw new Error(`native log ${DOC}`);
    },
    recordError: () => {
      throw new Error(`native record ${EMAIL}`);
    },
    setUserId: () => {
      throw new Error("native uid");
    },
  });
  await setCrashReportingEnabled(true);
  assert.doesNotThrow(() => recordError(new Error(`reject ${EMAIL}`), "ErrorBoundary"));
}

__resetCrashReportingForTests();
console.log("crashReporter.privacy.test.ts: ok (EXECUTED_PRODUCTION_METHOD)");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
