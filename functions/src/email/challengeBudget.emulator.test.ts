/**
 * Firestore emulator regression for verifyEmailChallengeAndBind.
 * A wrong code must leave incorrectAttempts committed for the next request.
 * Throwing inside the transaction used to roll that write back.
 */
import assert from "node:assert/strict";

import { getApps, deleteApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

import { verifyEmailChallengeAndBind, PENDING_COLLECTION, USERS } from "./challengeService";
import { digestEmailOtp } from "./otpCrypto";
import { runEmailIdentityFlowRegressions } from "./emailIdentityFlows.emulator.test";

const SECRET = "emulator-only-email-otp-hmac-secret-do-not-use-in-prod";
process.env.EMAIL_OTP_HMAC_SECRET = SECRET;
process.env.FUNCTIONS_EMULATOR = "true";

function errorCode(error: unknown): string {
  return String((error as { details?: { code?: string } }).details?.code ?? "");
}

async function wrongCode(uid: string, challengeId: string): Promise<string> {
  try {
    await verifyEmailChallengeAndBind({ uid, challengeId, code: "000000" });
    return "";
  } catch (error) {
    return errorCode(error);
  }
}

async function main(): Promise<void> {
  const host = process.env.FIRESTORE_EMULATOR_HOST ?? "";
  assert.match(host, /^(127\.0\.0\.1|localhost|\[::1\]):\d+$/);
  const db = getFirestore();
  const uid = "budget-user";
  const challengeId = "budget-challenge";
  const email = "owner@example.com";
  const now = Date.now();
  const digest = digestEmailOtp(SECRET, "123456", {
    challengeId,
    uid,
    normalizedEmail: email,
    version: 1,
  });
  await db.collection(USERS).doc(uid).set({
    uid,
    phoneE164: "+919800000001",
    emailStatus: "unverified",
    updatedAt: now,
  });
  await db.collection(PENDING_COLLECTION).doc(challengeId).set({
    challengeId,
    userId: uid,
    normalizedEmail: email,
    emailHash: "not-used-for-a-wrong-code",
    otpDigest: digest,
    version: 1,
    issuedAt: now,
    expiresAt: now + 60_000,
    resendAvailableAt: now,
    incorrectAttempts: 0,
    lockUntil: null,
    consumedAt: null,
    status: "active",
    idempotencyKey: null,
    purpose: "bind",
  });

  assert.equal(await wrongCode(uid, challengeId), "EMAIL_OTP_INVALID");
  assert.equal((await db.collection(PENDING_COLLECTION).doc(challengeId).get()).get("incorrectAttempts"), 1);
  assert.equal(await wrongCode(uid, challengeId), "EMAIL_OTP_INVALID");
  assert.equal((await db.collection(PENDING_COLLECTION).doc(challengeId).get()).get("incorrectAttempts"), 2);
  assert.equal(await wrongCode(uid, challengeId), "EMAIL_OTP_LOCKED");
  const locked = await db.collection(PENDING_COLLECTION).doc(challengeId).get();
  assert.equal(locked.get("status"), "locked");
  assert.equal(locked.get("incorrectAttempts"), 3);
  assert.ok(Number(locked.get("lockUntil")) > now);

  try {
    await verifyEmailChallengeAndBind({ uid, challengeId, code: "123456" });
    assert.fail("a locked challenge must not bind on a later correct code");
  } catch (error) {
    assert.equal(errorCode(error), "EMAIL_OTP_LOCKED");
  }
  assert.equal((await db.collection(PENDING_COLLECTION).doc(challengeId).get()).get("status"), "locked");
  assert.notEqual((await db.collection(USERS).doc(uid).get()).get("emailStatus"), "verified");

  const recoveryId = "recovery-challenge";
  const recoveryDigest = digestEmailOtp(SECRET, "654321", {
    challengeId: recoveryId,
    uid,
    normalizedEmail: email,
    version: 1,
  });
  await db.collection(PENDING_COLLECTION).doc(recoveryId).set({
    challengeId: recoveryId,
    userId: uid,
    normalizedEmail: email,
    emailHash: "not-a-bind",
    otpDigest: recoveryDigest,
    version: 1,
    issuedAt: now,
    expiresAt: now + 60_000,
    resendAvailableAt: now,
    incorrectAttempts: 0,
    lockUntil: null,
    consumedAt: null,
    status: "active",
    idempotencyKey: null,
    purpose: "recovery",
  });
  try {
    await verifyEmailChallengeAndBind({ uid, challengeId: recoveryId, code: "654321" });
    assert.fail("a recovery digest must not bind through verifyEmailChallengeAndBind");
  } catch (error) {
    assert.equal(errorCode(error), "CONFLICT");
  }
  assert.equal((await db.collection(PENDING_COLLECTION).doc(recoveryId).get()).get("status"), "active");
  assert.notEqual((await db.collection(USERS).doc(uid).get()).get("emailStatus"), "verified");
  console.log("challengeBudget.emulator.test.ts: ok");
  await runEmailIdentityFlowRegressions(db);
  await Promise.all(getApps().map((app) => deleteApp(app)));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
