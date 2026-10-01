/**
 * ErrorBoundary reporting: executed production helper + static getDerived input.
 * Label: EXECUTED_PRODUCTION_METHOD
 * Not a mounted React test. Not a native/device test.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { __setRuntimeSignalsForTests } from "@/config/env";
import {
  __resetCrashReportingForTests,
  __setCrashlyticsClientForTests,
  setCrashReportingEnabled,
} from "@/services/telemetry/crashReporter";
import { buildDiagnostics, formatDiagnosticsPlainText } from "./diagnostics";
import {
  reportUncaughtRenderError,
  UNCAUGHT_RENDER_SUMMARY,
  uncaughtRenderDiagnosticInput,
} from "./uncaughtRenderReport";

const EMAIL = "alice.reviewer@example.invalid";
const DOC = "WIDGET-BATCH-Q7-LEDGER";

function assertClean(value: unknown): void {
  const blob = typeof value === "string" ? value : JSON.stringify(value);
  assert.doesNotMatch(blob, /alice\.reviewer@example\.invalid/);
  assert.doesNotMatch(blob, /WIDGET-BATCH-Q7-LEDGER/);
  assert.doesNotMatch(blob, /in Fake/);
}

{
  const src = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "RootErrorBoundary.tsx"),
    "utf8"
  );
  assert.match(src, /uncaughtRenderDiagnosticInput/);
  assert.match(src, /reportUncaughtRenderError/);
  assert.doesNotMatch(src, /console\.error\(\s*"\[RootErrorBoundary\]"/);
  assert.doesNotMatch(src, /error\?\.message/);
  assert.doesNotMatch(src, /componentStack/);
}

process.env.EXPO_PUBLIC_APP_MODE = "production";
__setRuntimeSignalsForTests({
  appOwnership: null,
  isDev: false,
  platform: "android",
});

{
  const input = uncaughtRenderDiagnosticInput();
  assert.equal(input.message, UNCAUGHT_RENDER_SUMMARY);
  assert.equal(input.errorCode, "UNCAUGHT_JS_ERROR");
  assert.equal(input.failedStage, "ROUTER_READY");
  const diagnostics = buildDiagnostics(input);
  assert.equal(diagnostics.redactedMessage, UNCAUGHT_RENDER_SUMMARY);
  assert.equal(diagnostics.errorCode, "UNCAUGHT_JS_ERROR");
  const text = formatDiagnosticsPlainText(diagnostics);
  assert.match(text, /errorCode=UNCAUGHT_JS_ERROR/);
  assert.match(text, /failedStage=ROUTER_READY/);
  assert.doesNotMatch(text, /alice\.reviewer/);
}

{
  const errors: unknown[][] = [];
  const origError = console.error;
  console.error = (...args: unknown[]) => {
    errors.push(args);
  };
  const calls: { kind: string; payload: unknown }[] = [];
  __resetCrashReportingForTests();
  __setCrashlyticsClientForTests({
    setCrashlyticsCollectionEnabled: async () => {},
    log: (message) => calls.push({ kind: "log", payload: message }),
    recordError: (error) =>
      calls.push({
        kind: "recordError",
        payload: { name: error.name, message: error.message, stack: error.stack },
      }),
    setUserId: () => {},
  });

  const original = new Error(`render failed for ${EMAIL} ${DOC}`);
  const frozen = original.message;
  reportUncaughtRenderError(original);
  assert.equal(calls.length, 0, "disabled: no native log or recordError");
  assert.equal(original.message, frozen);

  setCrashReportingEnabled(true);
  reportUncaughtRenderError(original);
  assert.equal(original.message, frozen, "original Error is not modified");
  assert.equal(original.stack?.includes("render failed"), true);

  const all = JSON.stringify({ errors, calls });
  assertClean(all);
  assert.ok(errors.some((row) => row[0] === "[startup/errorBoundary]"));
  assert.ok(errors.some((row) => row[1] === "uncaught render error"));
  assert.ok(
    errors.every((row) => !JSON.stringify(row).includes("in Fake")),
    "component stack is not a console bypass"
  );
  const recorded = calls.filter((row) => row.kind === "recordError");
  assert.equal(recorded.length, 1);
  const payload = recorded[0]!.payload as { name: string; message: string };
  assert.equal(payload.name, "SafeDiagnosticError");
  assert.equal(payload.message, "diagnostic:unknown");

  console.error = origError;
  __resetCrashReportingForTests();
}

{
  const origError = console.error;
  console.error = () => {};
  let retried = false;
  const retry = () => {
    retried = true;
  };
  assert.doesNotThrow(() => {
    reportUncaughtRenderError(new Error(`boom ${EMAIL}`));
    retry();
  });
  assert.equal(retried, true, "reporting must not stop Retry");
  console.error = origError;
}

__setRuntimeSignalsForTests(null);
console.log("RootErrorBoundary.privacy.test.ts: ok (EXECUTED_PRODUCTION_METHOD)");
