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
  sanitizeLogMetadata,
} from "./safeDiagnostics";

const EMAIL = "alice.reviewer@example.invalid";
const DOC = "WIDGET-BATCH-Q7-LEDGER";
const QUERY = "SYNTHETIC_VALUE_Q7";

function assertNoSensitive(value: unknown): void {
  const blob = JSON.stringify(value) ?? "null";
  assert.doesNotMatch(blob, /alice\.reviewer@example\.invalid/);
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
  for (const protoName of ["constructor", "toString", "valueOf", "__proto__"]) {
    const mapped = classifyLogMessage(protoName);
    assert.equal(mapped.event, SAFE_UNCLASSIFIED_EVENT, protoName);
  }
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
    event: "WIDGET-BATCH-Q7-LEDGER",
    code: "UNCAUGHT_JS_ERROR",
    stage: "ROUTER_READY",
    count: 3,
    ms: 40,
    retryable: true,
    op: "save",
    attemptId: "SYNTHETIC_VALUE_Q7",
  });
  assert.ok(meta);
  assert.equal(meta!.code, "UNCAUGHT_JS_ERROR");
  assert.equal(meta!.stage, "ROUTER_READY");
  assert.equal(meta!.count, 3);
  assert.equal(meta!.ms, 40);
  assert.equal(meta!.retryable, true);
  assert.equal(meta!.op, "save");
  assert.equal(meta!.event, undefined);
  assert.equal(meta!.attemptId, undefined);
  const redactedAttempt = sanitizeLogMetadata({
    attemptId: "0123456789abcdef",
    phoneAuthStage: "confirm",
    reactivationStage: "account",
    kind: "unknown",
    ms: 20,
    phoneE164: "+919800000001",
    verificationId: "challenge-synthetic",
  });
  assert.equal(redactedAttempt?.attemptId, "0123456789abcdef");
  assert.equal(redactedAttempt?.phoneAuthStage, "confirm");
  assert.equal(redactedAttempt?.reactivationStage, "account");
  assert.equal(redactedAttempt?.kind, "unknown");
  assert.equal("phoneE164" in (redactedAttempt ?? {}), false);
  assert.equal("verificationId" in (redactedAttempt ?? {}), false);
  assert.equal(classifyLogMessage("phone auth operation").event, "phone_auth_operation");
  assert.equal(meta!.email, undefined);
  assert.equal(meta!.href, undefined);
  assert.equal(meta!.message, undefined);
  assertNoSensitive(meta);
}

{
  const rejected = sanitizeLogMetadata({
    code: "WIDGET-BATCH-Q7-LEDGER",
    attemptId: "SYNTHETIC_VALUE_Q7",
    event: "SYNTHETIC_VALUE_Q7",
  });
  assert.equal(rejected, undefined);
}

{
  const reserved = sanitizeLogMetadata(
    JSON.parse('{"constructor":"SYNTHETIC_VALUE_Q7","toString":"WIDGET-BATCH-Q7-LEDGER"}')
  );
  assert.equal(reserved, undefined);
  assertNoSensitive(reserved);

  const inherited = Object.create({
    code: "WIDGET-BATCH-Q7-LEDGER",
    count: 99,
  });
  inherited.stage = "BOOT";
  const inheritedMeta = sanitizeLogMetadata(inherited);
  assert.equal(inheritedMeta?.stage, "BOOT");
  assert.equal(inheritedMeta?.code, undefined);
  assert.equal(inheritedMeta?.count, undefined);
  assertNoSensitive(inheritedMeta);

  const proxy = new Proxy(
    { stage: "BOOT" },
    {
      getOwnPropertyDescriptor(target, prop) {
        if (prop === "count") throw new Error(`desc ${QUERY}`);
        return Reflect.getOwnPropertyDescriptor(target, prop);
      },
    }
  );
  const proxyMeta = sanitizeLogMetadata(proxy);
  assert.equal(proxyMeta?.stage, "BOOT");
  assert.equal(proxyMeta?.count, undefined);
  assertNoSensitive(proxyMeta);
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
  const safe = createSafeDiagnosticError(err, `ErrorBoundary ${EMAIL}`, "corr-test-01");
  assert.equal(safe.name, "SafeDiagnosticError");
  assert.equal(safe.message, "diagnostic:invalid");
  assert.equal(safe.code, "auth/invalid-email");
  assert.equal(safe.context, "app");
  assert.equal(safe.correlationId, "corr-test-01");
  assert.doesNotMatch(safe.message, /alice\.reviewer|WIDGET-BATCH|Firebase:|already in use/);
  assert.doesNotMatch(safe.stack ?? "", /alice\.reviewer|WIDGET-BATCH|customData/);
  assert.match(safe.stack ?? "", /code=auth\/invalid-email/);
  assert.match(safe.stack ?? "", /context=app/);
  assert.match(safe.stack ?? "", /correlation=corr-test-01/);
  assert.equal(err.message.includes(EMAIL), true, "original Error is not mutated");
  assert.equal((err as { customData?: { email?: string } }).customData?.email, EMAIL);
}

{
  const leaked = Object.assign(
    new Error(
      `Firebase: callable resolveOrCreateUserByPhone failed age_not_admitted ${EMAIL} /Users/shivamsaurav/secret/firestore/users/abc`
    ),
    { code: "auth/network-request-failed" }
  );
  leaked.stack = [
    `Error: Firebase callable resolveOrCreateUserByPhone age_not_admitted ${EMAIL} /Users/shivamsaurav/secret/firestore/users/abc`,
    "    at submit (/Users/shivamsaurav/proj/src/auth/session.ts:12:3)",
    "    at leak (src/auth/leak.ts?email=alice.reviewer@example.invalid:1:1)",
    "    at pkg (/Users/shivamsaurav/proj/node_modules/firebase/index.js:2:2)",
    "    at hidden (/Users/shivamsaurav/secret/firestore/users/abc:1:1)",
    "    at bearer (Bearer eyJhbGci.secret)",
  ].join("\n");
  const diag = createSafeDiagnosticError(leaked, "auth/nativePhone", "corr-stack-02");
  const blob = `${diag.message}\n${diag.stack}`;
  assert.equal(diag.message, "diagnostic:unavailable");
  assert.equal(diag.code, "auth/network-request-failed");
  assert.equal(diag.context, "auth/nativePhone");
  assert.match(diag.stack ?? "", /src\/auth\/session\.ts/);
  assert.doesNotMatch(blob, /node_modules/);
  assert.doesNotMatch(blob, /age_not_admitted/);
  assert.doesNotMatch(blob, /resolveOrCreateUserByPhone/);
  assert.doesNotMatch(blob, /alice\.reviewer/);
  assert.doesNotMatch(blob, /\/Users\//);
  assert.doesNotMatch(blob, /firestore/);
  assert.doesNotMatch(blob, /Bearer|eyJ|AIza/);
  assert.doesNotMatch(diag.message, /Firebase|callable|already/);
}

{
  const bare = new Error("age_not_admitted");
  bare.stack = "Error: age_not_admitted\n    at call (node_modules/@firebase/functions/lib.js:1:1)";
  const fallback = createSafeDiagnosticError(bare, `not-a-label ${EMAIL}`);
  const blob = `${fallback.message}\n${fallback.stack}`;
  assert.equal(fallback.message, "diagnostic:unknown");
  assert.equal(fallback.code, "unknown");
  assert.equal(fallback.context, "app");
  assert.match(fallback.stack ?? "", /at unknown \(app\)/);
  assert.doesNotMatch(blob, /age_not_admitted/);
  assert.doesNotMatch(blob, /node_modules/);
  assert.doesNotMatch(blob, /alice\.reviewer/);
  assert.doesNotMatch(blob, /@firebase/);
}

{
  const cyclic: Record<string, unknown> = { code: "save_failed", self: null };
  cyclic.self = cyclic;
  const meta = sanitizeLogMetadata(cyclic);
  assert.equal(meta?.code, "save_failed");
  assertNoSensitive(meta);
}

{
  let allowedGets = 0;
  let unknownGets = 0;
  const poisoned: Record<string, unknown> = {};
  Object.defineProperty(poisoned, "count", {
    enumerable: true,
    get() {
      allowedGets += 1;
      throw new Error(`getter boom ${EMAIL} ${DOC}`);
    },
  });
  Object.defineProperty(poisoned, "notes", {
    enumerable: true,
    get() {
      unknownGets += 1;
      return DOC;
    },
  });
  Object.defineProperty(poisoned, "stage", {
    enumerable: true,
    value: "BOOT",
  });
  const meta = sanitizeLogMetadata(poisoned);
  assert.equal(allowedGets, 0);
  assert.equal(unknownGets, 0);
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

{
  const meta = sanitizeLogMetadata({
    firebaseAuthCode: "auth/missing-activity",
    androidActivity: "missing",
    attemptId: "send_not_a_hex_attempt",
  });
  assert.equal(meta?.firebaseAuthCode, "auth/missing-activity");
  assert.equal(meta?.androidActivity, "missing");
  assert.equal(meta?.attemptId, undefined);
  const classified = classifyError({ name: "Error", code: "auth/missing-activity" });
  assert.equal(classified.code, "auth/missing-activity");
}

console.log("safeDiagnostics.test.ts: ok (PURE_HELPER)");
