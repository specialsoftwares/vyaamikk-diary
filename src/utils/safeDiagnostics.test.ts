/**
 * Pure helper tests for the safe diagnostic contract.
 * Label: PURE_HELPER
 */
import assert from "node:assert/strict";

import { redactStartupMessage } from "@/startup/errors";

import {
  SAFE_GENERIC_SUMMARY,
  SAFE_UNCLASSIFIED_EVENT,
  classifyContext,
  classifyError,
  classifyLogMessage,
  classifyScope,
  createSafeDiagnosticError,
  inspectWithoutThrowing,
  sanitizeLogMetadata,
} from "./safeDiagnostics";

const EMAIL = "alice.reviewer@example.invalid";
const DOC = "WIDGET-BATCH-Q7-LEDGER";
const QUERY = "SYNTHETIC_VALUE_Q7";

function assertNoSensitive(value: unknown): void {
  const blob = JSON.stringify(value);
  assert.doesNotMatch(blob, new RegExp(EMAIL.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.doesNotMatch(blob, /WIDGET-BATCH-Q7-LEDGER/);
  assert.doesNotMatch(blob, /SYNTHETIC_VALUE_Q7/);
  assert.doesNotMatch(blob, /password=VALUE/);
  assert.doesNotMatch(blob, /9876543210/);
}

{
  const leak = redactStartupMessage(
    `Request failed: https://example.invalid?api_key=${QUERY}`
  );
  assert.match(leak, new RegExp(QUERY), "baseline: redactStartupMessage keeps query values");
}

{
  const known = classifyLogMessage("boot failed");
  assert.equal(known.event, "auth_boot_failed");
  assert.equal(known.summary, "auth boot failed");
  const unknown = classifyLogMessage(`save failed for ${EMAIL} ${DOC}`);
  assert.equal(unknown.event, SAFE_UNCLASSIFIED_EVENT);
  assert.equal(unknown.summary, SAFE_GENERIC_SUMMARY);
  assertNoSensitive(unknown);
  const callable = classifyLogMessage("callable mintClientAuthToken failed");
  assert.equal(callable.event, "identity_callable_failed");
  const badCallable = classifyLogMessage(`callable ${EMAIL} failed`);
  assert.equal(badCallable.event, SAFE_UNCLASSIFIED_EVENT);
}

{
  assert.equal(classifyScope("state/auth"), "state/auth");
  assert.equal(classifyScope(`auth ${EMAIL} ${DOC}`), "app");
  assert.equal(classifyContext("ErrorBoundary"), "ErrorBoundary");
  assert.equal(classifyContext(`ErrorBoundary ${DOC}`), "app");
}

{
  const meta = sanitizeLogMetadata({
    email: EMAIL,
    phone: "+919876543210",
    href: `https://example.invalid?api_key=${QUERY}`,
    url: `https://example.invalid?password=VALUE_SYNTH_9`,
    message: `invoice ${DOC}`,
    msg: DOC,
    err: `failed ${EMAIL}`,
    detail: DOC,
    html: `<!DOCTYPE html><html><body>${DOC}</body></html>`,
    customData: { email: EMAIL },
    notes: DOC,
    code: "UNCAUGHT_JS_ERROR",
    stage: "ROUTER_READY",
    count: 3,
    ms: 40,
    retryable: true,
    op: "save",
  });
  assert.ok(meta);
  assert.equal(meta!.code, "UNCAUGHT_JS_ERROR");
  assert.equal(meta!.stage, "ROUTER_READY");
  assert.equal(meta!.count, 3);
  assert.equal(meta!.ms, 40);
  assert.equal(meta!.retryable, true);
  assert.equal(meta!.op, "save");
  assert.equal(meta!.email, undefined);
  assert.equal(meta!.href, undefined);
  assert.equal(meta!.message, undefined);
  assertNoSensitive(meta);
}

{
  const err = Object.assign(new Error(`Firebase: ${EMAIL} already in use ${DOC}`), {
    code: "auth/invalid-email",
    customData: { email: EMAIL, invoice: DOC },
  });
  const classified = classifyError(err);
  assert.equal(classified.class, "invalid");
  assert.equal(classified.code, "auth/invalid-email");
  assertNoSensitive(classified);
  const safe = createSafeDiagnosticError(err, `ErrorBoundary ${EMAIL}`);
  assert.equal(safe.name, "SafeDiagnosticError");
  assert.equal(safe.message, "diagnostic:invalid");
  assert.doesNotMatch(safe.stack ?? "", /alice\.reviewer|WIDGET-BATCH|customData/);
  assert.equal(err.message.includes(EMAIL), true, "original Error is not mutated");
  assert.equal((err as { customData?: { email?: string } }).customData?.email, EMAIL);
}

{
  const cyclic: Record<string, unknown> = { code: "save_failed", self: null };
  cyclic.self = cyclic;
  assert.equal(inspectWithoutThrowing(cyclic), "ok");
  const meta = sanitizeLogMetadata(cyclic);
  assert.equal(meta?.code, "save_failed");
  assertNoSensitive(meta);
}

{
  const huge = { attemptId: "x".repeat(5000), code: "unknown" };
  const meta = sanitizeLogMetadata(huge);
  assert.equal(meta?.attemptId, undefined);
  assert.equal(meta?.code, "unknown");
}

{
  const poisoned = {};
  Object.defineProperty(poisoned, "count", {
    enumerable: true,
    get() {
      throw new Error(`getter boom ${EMAIL} ${DOC}`);
    },
  });
  Object.defineProperty(poisoned, "stage", {
    enumerable: true,
    value: "BOOT",
  });
  assert.equal(inspectWithoutThrowing(poisoned), "ok");
  const meta = sanitizeLogMetadata(poisoned);
  assert.equal(meta?.stage, "BOOT");
  assert.equal(meta?.count, undefined);
  assertNoSensitive(meta);
}

{
  const appLike = Object.assign(new Error("do not print"), {
    name: "AppError",
    code: "permission_denied",
  });
  const classified = classifyError(appLike);
  assert.equal(classified.class, "permission");
  assert.equal(classified.code, "permission_denied");
}

console.log("safeDiagnostics.test.ts: ok (PURE_HELPER)");
