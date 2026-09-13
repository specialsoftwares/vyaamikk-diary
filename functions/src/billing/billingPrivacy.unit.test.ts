/**
 * Privacy + safe-error + logging contracts.
 * Run: npm run test:billing-privacy
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { BillingLogPrivacyError, assertBillingLogContext, billingLog } from "./log";
import {
  BillingError,
  clientSafeErrorContainsSecrets,
  toClientSafeBillingError,
} from "./errors";

assert.throws(
  () => assertBillingLogContext({ uid: "raw-uid", diagnosticUid: "abcd" }),
  BillingLogPrivacyError
);
assert.throws(() => assertBillingLogContext({ purchaseToken: "tok" }), BillingLogPrivacyError);
assert.throws(() => assertBillingLogContext({ phoneE164: "+91" }), BillingLogPrivacyError);
assert.throws(() => assertBillingLogContext({ receipt: "r" }), BillingLogPrivacyError);
assert.throws(() => assertBillingLogContext({ signedTransaction: "jws" }), BillingLogPrivacyError);
assert.throws(() => assertBillingLogContext({ email: "a@b.c" }), BillingLogPrivacyError);
assert.throws(() => assertBillingLogContext({ businessName: "X" }), BillingLogPrivacyError);
assert.throws(() => assertBillingLogContext({ gstin: "09AAAAA0000A1Z5" }), BillingLogPrivacyError);
assert.throws(() => assertBillingLogContext({ legalName: "X" }), BillingLogPrivacyError);

const ok = assertBillingLogContext({
  correlationId: "c1",
  diagnosticUid: "deadbeefdeadbeef",
  source: "rtdn",
  platform: "android",
  eventType: "activatePaid",
  result: "ok",
  latencyMs: 12,
  retryable: false,
});
assert.equal(ok.diagnosticUid, "deadbeefdeadbeef");

const captured: unknown[] = [];
billingLog("info", { diagnosticUid: "deadbeefdeadbeef", result: "ok" }, (_level, ctx) => {
  captured.push(ctx);
});
assert.deepEqual(captured[0], { diagnosticUid: "deadbeefdeadbeef", result: "ok" });

const raw = new Error("Play API 400 purchaseToken=SECRETSTACK");
const safe = toClientSafeBillingError(raw);
assert.equal(safe.code, "internal_error");
assert.equal(clientSafeErrorContainsSecrets(safe), false);
assert.ok(!JSON.stringify(safe).includes("purchaseToken"));
assert.ok(!JSON.stringify(safe).includes("SECRETSTACK"));

const typed = new BillingError({
  clientCode: "verification_failed",
  causeCode: "play_api_invalid_token",
});
const safeTyped = toClientSafeBillingError(typed);
assert.equal(safeTyped.code, "verification_failed");
assert.ok(!JSON.stringify(safeTyped).includes("play_api_invalid_token"));

const persistSrc = readFileSync(resolve(__dirname, "applyTransition.ts"), "utf8");
assert.ok(!persistSrc.includes("console.log(req.uid)"));
assert.match(persistSrc, /diagnosticUid/);

const auditSrc = readFileSync(resolve(__dirname, "types.ts"), "utf8");
assert.match(auditSrc, /export interface SubscriptionAuditLogEventDoc/);
assert.ok(!/export interface SubscriptionAuditLogEventDoc \{[^}]*\buid: string/.test(auditSrc));

// substring plan inference must never return (exact catalog only)
const transitionSrc = readFileSync(resolve(__dirname, "transition.ts"), "utf8");
assert.ok(!transitionSrc.includes('includes("business")'));
assert.ok(!transitionSrc.includes('includes("professional")'));
assert.ok(!transitionSrc.includes('includes("starter")'));
assert.match(transitionSrc, /SUBSCRIPTION_CATALOG/);

// trial idempotency key must be the opaque digest, never raw identity/uid
const trialSrc = readFileSync(resolve(__dirname, "trialGrant.ts"), "utf8");
assert.ok(!trialSrc.includes("`trial:${identity}"));
assert.match(trialSrc, /opaqueTrialIdempotencyKey/);

console.log("billingPrivacy.unit.test.ts: ok");
