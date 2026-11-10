import assert from "node:assert/strict";

import { AppError } from "@/domain/errors";
import type { UserProfile } from "@/domain/types";
import { createReactivationEmailVerification } from "@/services/auth/reactivationEmailVerification";

import {
  createPhoneAuthOperations,
  escapePhoneChallenge,
  openRestoredPhoneChallenge,
  submitPhoneResend,
  submitPhoneVerification,
} from "./phoneAuthOperation";

const PROFILE = { uid: "uid-synthetic", status: "active" } as UserProfile;

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  let reject: (error: unknown) => void = () => undefined;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  const now = 1_700_000_000_000;
  const restored = openRestoredPhoneChallenge({
    action: "resume",
    restored: true,
    expiresAt: now + 60_000,
    resendAvailableAt: now + 19_000,
    now,
  });
  assert.equal(restored.openOtp, true);
  assert.equal(restored.expiresAt, now + 60_000);

  const invalid = createPhoneAuthOperations(() => now);
  let invalidOverlay = "off";
  const invalidView = await submitPhoneVerification({
    ops: invalid,
    code: "000000",
    confirmBoundMs: 50,
    confirm: async () => {
      invalidOverlay = invalid.view().overlay;
      throw new AppError("invalid_otp", "That code is not valid.");
    },
    continueAccount: async () => ({ navigate: "account" }),
  });
  assert.equal(invalidOverlay, "verifying");
  assert.equal(invalidView.settlement, "invalid");
  assert.equal(invalidView.overlay, "off");
  assert.equal(invalidView.busy, false);
  assert.equal(invalidView.clearCode, true);
  assert.equal(invalidView.navigate, null);
  assert.equal(invalid.view().busy, false);

  const changed = createPhoneAuthOperations(() => now);
  const changedView = await submitPhoneVerification({
    ops: changed,
    code: "123456",
    confirmBoundMs: 50,
    confirm: async () => {
      assert.equal(changed.view().overlay, "verifying");
      return PROFILE;
    },
    continueAccount: async () => ({ navigate: null, settlement: "session_changed" }),
  });
  assert.equal(changedView.settlement, "session_changed");
  assert.equal(changedView.overlay, "off");
  assert.equal(changedView.navigate, null);
  assert.equal(changed.view().busy, false);

  const hung = deferred<typeof PROFILE>();
  let continued = 0;
  const never = createPhoneAuthOperations(() => now);
  const neverView = await submitPhoneVerification({
    ops: never,
    code: "123456",
    confirmBoundMs: 30,
    confirm: () => hung.promise,
    continueAccount: async () => {
      continued += 1;
      return { navigate: "account" };
    },
  });
  assert.equal(neverView.settlement, "unknown");
  assert.equal(neverView.overlay, "off");
  assert.equal(neverView.navigate, null);
  assert.equal(never.view().busy, false);
  hung.resolve(PROFILE);
  await wait(20);
  assert.equal(continued, 0);

  const lateFail = deferred<typeof PROFILE>();
  const late = createPhoneAuthOperations(() => now);
  const lateView = await submitPhoneVerification({
    ops: late,
    code: "123456",
    confirmBoundMs: 30,
    confirm: () => lateFail.promise,
    continueAccount: async () => ({ navigate: "account" }),
  });
  assert.equal(lateView.settlement, "unknown");
  lateFail.reject(new AppError("invalid_otp", "late"));
  await wait(20);
  assert.equal(late.view().overlay, "off");
  assert.equal(late.view().busy, false);

  const pending = deferred<typeof PROFILE>();
  const leaving = createPhoneAuthOperations(() => now);
  let cleanupStarted = false;
  const verification = submitPhoneVerification({
    ops: leaving,
    code: "123456",
    confirmBoundMs: 200,
    confirm: () => pending.promise,
    continueAccount: async () => ({ navigate: "account" }),
  });
  await wait(10);
  assert.equal(leaving.view().overlay, "verifying");
  const leavingId = leaving.view().operationId;
  leaving.retire();
  const cleanup = escapePhoneChallenge({
    ops: leaving,
    operationId: leavingId,
    boundMs: 40,
    clear: () => {
      cleanupStarted = true;
      return new Promise((resolve) => setTimeout(resolve, 10));
    },
  });
  assert.equal(leaving.view().busy, false);
  assert.equal(leaving.view().overlay, "off");
  pending.resolve(PROFILE);
  const abandoned = await verification;
  const cleaned = await cleanup;
  assert.equal(abandoned.applied, false);
  assert.equal(cleanupStarted, true);
  assert.equal(cleaned.storage, "ok");
  assert.equal(cleaned.overlay, "off");

  const stuckCleanup = createPhoneAuthOperations(() => now);
  const stuck = await escapePhoneChallenge({
    ops: stuckCleanup,
    boundMs: 20,
    clear: () => new Promise(() => undefined),
  });
  assert.equal(stuck.storage, "unknown");
  assert.equal(stuck.busy, false);
  assert.equal(stuckCleanup.view().overlay, "off");

  const blocked = openRestoredPhoneChallenge({
    action: "resume",
    restored: false,
    expiresAt: now + 60_000,
    resendAvailableAt: now + 19_000,
    now,
  });
  assert.equal(blocked.openOtp, false);
  const extended = openRestoredPhoneChallenge({
    action: "resume",
    restored: true,
    expiresAt: now - 1,
    resendAvailableAt: now,
    now,
  });
  assert.equal(extended.openOtp, false);
  assert.equal(extended.expiresAt, now - 1);

  let sends = 0;
  const resend = createPhoneAuthOperations(() => now);
  const early = await submitPhoneResend({
    ops: resend,
    invoke: false,
    forceResend: false,
    send: async () => {
      sends += 1;
      return "sent";
    },
  });
  assert.equal(early.sent, false);
  assert.equal(sends, 0);
  const firstSend = deferred<string>();
  const accepted = submitPhoneResend({
    ops: resend,
    invoke: true,
    forceResend: true,
    boundMs: 80,
    send: () => {
      sends += 1;
      return firstSend.promise;
    },
  });
  await wait(10);
  const duplicate = await submitPhoneResend({
    ops: resend,
    invoke: true,
    forceResend: true,
    send: async () => {
      sends += 1;
      return "duplicate";
    },
  });
  assert.equal(duplicate.ignored, true);
  assert.equal(sends, 1);
  firstSend.resolve("one");
  const finished = await accepted;
  assert.equal(finished.sent, true);
  assert.equal(finished.value, "one");
  const restart = await submitPhoneResend({
    ops: resend,
    invoke: true,
    forceResend: true,
    send: async () => {
      sends += 1;
      return "restart";
    },
  });
  assert.equal(restart.sent, true);
  assert.equal(sends, 2);

  let confirms = 0;
  const setup = createPhoneAuthOperations(() => now);
  const setupView = await submitPhoneVerification({
    ops: setup,
    code: "123456",
    confirmBoundMs: 50,
    confirm: async () => {
      confirms += 1;
      return PROFILE;
    },
    continueAccount: async () => {
      throw new AppError("save_failed", "Account setup did not finish.", undefined, {
        authPhase: "post_auth",
        firebaseSignInSucceeded: true,
        retryAccountSetup: true,
      });
    },
  });
  assert.equal(confirms, 1);
  assert.equal(setupView.settlement, "account_failed");
  assert.equal(setupView.navigate, null);
  assert.equal(setupView.overlay, "off");

  let completes = 0;
  let finishes = 0;
  const reactivation = createReactivationEmailVerification();
  const firstReactivation = await reactivation.submit({
    code: "010203",
    challengeId: "challenge-synthetic",
    online: true,
    isCurrent: () => true,
    complete: async () => {
      completes += 1;
      return PROFILE;
    },
    finish: async () => {
      finishes += 1;
      throw new Error("local-session");
    },
    readAccount: async () => ({ status: "active", profile: PROFILE }),
    messageFor: () => "local",
    offlineMessage: "offline",
    unknownMessage: "unknown",
    localFailureMessage: "local",
    timeoutMs: 50,
  });
  assert.equal(firstReactivation.outcome, "local_failed");
  assert.equal(firstReactivation.navigate, false);
  const secondReactivation = await reactivation.submit({
    code: "010203",
    challengeId: "challenge-synthetic",
    online: true,
    isCurrent: () => true,
    complete: async () => {
      completes += 1;
      return PROFILE;
    },
    finish: async () => {
      finishes += 1;
    },
    readAccount: async () => ({ status: "active", profile: PROFILE }),
    messageFor: () => "local",
    offlineMessage: "offline",
    unknownMessage: "unknown",
    localFailureMessage: "local",
    timeoutMs: 50,
  });
  assert.equal(secondReactivation.outcome, "verified");
  assert.equal(completes, 1);
  assert.equal(finishes, 2);

  const older = deferred<typeof PROFILE>();
  const switched = createPhoneAuthOperations(() => now);
  const oldSubmit = submitPhoneVerification({
    ops: switched,
    code: "111111",
    confirmBoundMs: 200,
    confirm: () => older.promise,
    continueAccount: async () => ({ navigate: "account" }),
  });
  await wait(10);
  const oldId = switched.view().operationId;
  switched.retire();
  const newer = submitPhoneVerification({
    ops: switched,
    code: "222222",
    confirmBoundMs: 200,
    confirm: () => new Promise(() => undefined),
    continueAccount: async () => ({ navigate: "account" }),
  });
  await wait(10);
  assert.notEqual(switched.view().operationId, oldId);
  assert.equal(switched.view().overlay, "verifying");
  older.resolve(PROFILE);
  const oldResult = await oldSubmit;
  assert.equal(oldResult.applied, false);
  assert.equal(switched.view().overlay, "verifying");
  assert.equal(switched.view().busy, true);
  switched.retire();
  await newer;

  console.log("phoneAuthOperation.test.ts: ok");
}

void main();
