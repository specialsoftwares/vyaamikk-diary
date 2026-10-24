/**
 * Executed production crashReporter methods with an injected Crashlytics port.
 * Label: EXECUTED_PRODUCTION_METHOD (injected port — not native consent)
 */
import assert from "node:assert/strict";

import {
  __resetCrashReportingForTests,
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

__resetCrashReportingForTests();

{
  const calls: { kind: string; payload: unknown }[] = [];
  __setCrashlyticsClientForTests({
    setCrashlyticsCollectionEnabled: async () => {},
    log: (message) => {
      calls.push({ kind: "log", payload: message });
    },
    recordError: (error) => {
      calls.push({
        kind: "recordError",
        payload: { name: error.name, message: error.message, stack: error.stack },
      });
    },
    setUserId: () => {},
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

  setCrashReportingEnabled(true);
  recordError(original, "ErrorBoundary");
  log(`invoice ${DOC} ${EMAIL}`);

  assert.ok(calls.some((row) => row.kind === "log" && row.payload === "ErrorBoundary"));
  assert.ok(calls.some((row) => row.kind === "log" && row.payload === "app"));
  const recorded = calls.filter((row) => row.kind === "recordError");
  assert.equal(recorded.length, 1);
  const payload = recorded[0]!.payload as { name: string; message: string; stack: string };
  assert.equal(payload.name, "SafeDiagnosticError");
  assert.equal(payload.message, "diagnostic:unknown");
  assert.doesNotMatch(payload.stack, /alice\.reviewer|WIDGET-BATCH|customData|cause/);
  assertClean(calls);
  assert.equal(original.message.includes(EMAIL), true, "original Error unchanged");
  assert.equal((original as { customData?: { email?: string } }).customData?.email, EMAIL);
}

{
  __resetCrashReportingForTests();
  __setCrashlyticsClientForTests(null);
  setCrashReportingEnabled(true);
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
  assert.doesNotThrow(() => setCrashReportingEnabled(true));
  assert.doesNotThrow(() => recordError(new Error(`reject ${EMAIL}`), "ErrorBoundary"));
}

__resetCrashReportingForTests();
console.log("crashReporter.privacy.test.ts: ok (EXECUTED_PRODUCTION_METHOD)");
