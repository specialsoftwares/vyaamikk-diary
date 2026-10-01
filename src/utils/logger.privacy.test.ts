/**
 * Executed production createLogger with captured console.
 * Label: EXECUTED_PRODUCTION_METHOD
 */
import assert from "node:assert/strict";

import { __setRuntimeSignalsForTests } from "@/config/env";

import { createLogger } from "./logger";

const EMAIL = "alice.reviewer@example.invalid";
const DOC = "WIDGET-BATCH-Q7-LEDGER";
const QUERY = "SYNTHETIC_VALUE_Q7";
const PHONE = "+919876543210";
const HTML = "<!DOCTYPE html><html><body>" + "x".repeat(160) + DOC + "</body></html>";

function capture() {
  const errors: unknown[][] = [];
  const warns: unknown[][] = [];
  const origError = console.error;
  const origWarn = console.warn;
  console.error = (...args: unknown[]) => {
    errors.push(args);
  };
  console.warn = (...args: unknown[]) => {
    warns.push(args);
  };
  return {
    errors,
    warns,
    restore() {
      console.error = origError;
      console.warn = origWarn;
    },
  };
}

function blob(rows: unknown[][]): string {
  return JSON.stringify(rows, (_k, v) => {
    if (v instanceof Error) return { name: v.name, message: v.message, stack: v.stack };
    return v;
  });
}

function assertClean(text: string): void {
  assert.doesNotMatch(text, /alice\.reviewer@example\.invalid/);
  assert.doesNotMatch(text, /WIDGET-BATCH-Q7-LEDGER/);
  assert.doesNotMatch(text, /SYNTHETIC_VALUE_Q7/);
  assert.doesNotMatch(text, /password=VALUE/);
  assert.doesNotMatch(text, /9876543210/);
  assert.doesNotMatch(text, /<!DOCTYPE html>/i);
}

process.env.EXPO_PUBLIC_APP_MODE = "production";
__setRuntimeSignalsForTests({
  appOwnership: null,
  isDev: false,
  platform: "android",
});

const sink = capture();
try {
  const log = createLogger("state/auth");
  log.error(`save failed for ${EMAIL}`, { email: EMAIL, phone: PHONE, notes: DOC });
  log.warn("nested", { user: { email: EMAIL }, profile: { token: "tok_synthetic" } });
  log.error("url", { href: `https://example.invalid?api_key=${QUERY}` });
  log.error(`password=VALUE_SYNTH_9 api_key=${QUERY}`);
  log.error(HTML);
  log.error("boot failed", Object.assign(new Error(`Firebase ${EMAIL} ${DOC}`), {
    code: "auth/invalid-email",
    customData: { email: EMAIL },
  }));
  const leakScope = createLogger(`scope ${EMAIL} ${DOC}`);
  leakScope.error("boot failed", { stage: "AUTH_HYDRATED", count: 2, ms: 15, retryable: false });

  const all = blob(sink.errors.concat(sink.warns));
  assertClean(all);

  const boot = sink.errors.find((row) => JSON.stringify(row).includes("auth_boot_failed"));
  assert.ok(boot, "known message maps to auth_boot_failed");
  assert.equal(boot![1], "auth boot failed");
  const payload = boot![2] as { event: string; errorClass?: string; code?: string };
  assert.equal(payload.event, "auth_boot_failed");
  assert.equal(payload.errorClass, "invalid");
  assert.equal(payload.code, "auth/invalid-email");

  const scoped = sink.errors.find((row) => row[0] === "[app]");
  assert.ok(scoped, "unknown scope falls back to app");
  const scopedPayload = scoped![2] as { stage?: string; count?: number; ms?: number };
  assert.equal(scopedPayload.stage, "AUTH_HYDRATED");
  assert.equal(scopedPayload.count, 2);
  assert.equal(scopedPayload.ms, 15);

  const unclassified = sink.errors.find((row) =>
    JSON.stringify(row).includes("unclassified")
  );
  assert.ok(unclassified, "unknown messages become unclassified");
  assert.equal(unclassified![1], "diagnostic_event");
} finally {
  sink.restore();
  __setRuntimeSignalsForTests(null);
}

console.log("logger.privacy.test.ts: ok (EXECUTED_PRODUCTION_METHOD)");
