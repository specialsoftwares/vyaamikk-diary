/**
 * Recoverable phone-auth regressions.
 * These drive the production controller, native module, and publication helpers.
 * A fake clock stands in for the 45s and 20s budgets so the suite does not wait them out.
 */
import assert from "node:assert/strict";

import type { UserProfile } from "@/domain/types";
import type { PhoneE164 } from "@/domain/types";
import { AppError } from "@/domain/errors";
import {
  PHONE_ACCOUNT_BOUND_MS,
  PHONE_AUTH_USER_BOUND_MS,
  PHONE_CLEANUP_BOUND_MS,
  PHONE_NATIVE_CONFIRM_BOUND_MS,
  PHONE_NATIVE_SEND_BOUND_MS,
  PHONE_SESSION_BOUND_MS,
  createPhoneAuthOperations,
  leaveAuthenticatedPhoneChallenge,
  raceOwnedPublication,
  submitPhoneVerification,
  type PhoneAuthWait,
} from "@/auth-v2/phoneAuthOperation";
import { retryAuthenticatedAccountSetup } from "@/auth-v2/phoneProfileContinuation";
import {
  REACTIVATION_VERIFY_BOUND_MS,
  createReactivationEmailVerification,
  reactivationAccountFromServerRead,
} from "@/services/auth/reactivationEmailVerification";
import {
  __clearNativePhoneSessions,
  __installAndroidActivityBridgeForTests,
  __installNativePhoneAuthModuleForTests,
  __seedPendingSessionForTests,
  confirmNativePhoneOtp,
  createAndroidActivityBridge,
  observePostSendAuthForChallenge,
  recoverUnsettledNativeConfirm,
  recoverUnsettledNativeSend,
  retireDispatchedNativeConfirm,
  retireDispatchedNativeSend,
  startNativePhoneOtp,
} from "@/services/auth/nativePhoneAuth";
import type { OtpChallenge } from "@/services/auth/types";

const PHONE = "+919800000001" as PhoneE164;
const OTHER = "+919800000002" as PhoneE164;
const PROFILE = { uid: "uid-synthetic", phoneE164: PHONE, status: "active" } as UserProfile;

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function createFakeClock(start = 0): {
  now: () => number;
  wait: PhoneAuthWait;
  advance: (ms: number) => void;
} {
  let time = start;
  const timers: Array<{ at: number; resolve: () => void; cancelled: boolean }> = [];
  const wait: PhoneAuthWait = (ms) => {
    let resolveTimer: () => void = () => undefined;
    const promise = new Promise<void>((resolve) => {
      resolveTimer = () => resolve();
    });
    const entry = { at: time + ms, resolve: resolveTimer, cancelled: false };
    timers.push(entry);
    return {
      promise,
      cancel: () => {
        entry.cancelled = true;
      },
    };
  };
  return {
    now: () => time,
    wait,
    advance(ms: number) {
      time += ms;
      for (const timer of timers) {
        if (!timer.cancelled && timer.at <= time) {
          timer.cancelled = true;
          timer.resolve();
        }
      }
    },
  };
}

async function flush(): Promise<void> {
  for (let i = 0; i < 6; i += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

function withTimeout<T>(work: Promise<T>, label: string, ms = 1000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} did not settle`)), ms);
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

function installNative(activity: () => unknown) {
  let currentUser: { uid: string; phoneNumber: string } | null = null;
  let signInCalls = 0;
  let signOutCalls = 0;
  let lastPhone = "";
  let pendingResolve: ((value: { verificationId: string; confirm: (code: string) => Promise<unknown> }) => void) | null =
    null;
  const activityIds = new WeakMap<object, string>();
  let nextActivityId = 1;
  const auth = {
    getCurrentActivity: () => activity(),
    settings: {},
    get currentUser() {
      return currentUser;
    },
    async signOut() {
      signOutCalls += 1;
      currentUser = null;
    },
    signInWithPhoneNumber(phone: string) {
      signInCalls += 1;
      lastPhone = phone;
      return new Promise((resolve) => {
        pendingResolve = resolve;
      });
    },
    onAuthStateChanged(listener: (user: { uid?: string; phoneNumber?: string } | null) => void) {
      listener(currentUser);
      return () => undefined;
    },
  };
  __installNativePhoneAuthModuleForTests({
    platform: "android",
    module: { default: () => auth, PhoneAuthProvider: {} } as never,
  });
  __installAndroidActivityBridgeForTests(
    createAndroidActivityBridge(() => {
      const current = activity();
      if (!current || typeof current !== "object") return null;
      const key = current;
      let id = activityIds.get(key);
      if (!id) {
        id = String(nextActivityId);
        nextActivityId += 1;
        activityIds.set(key, id);
      }
      return { id };
    })
  );
  return {
    signInCalls: () => signInCalls,
    signOutCalls: () => signOutCalls,
    lastPhone: () => lastPhone,
    setUser(user: { uid: string; phoneNumber: string } | null) {
      currentUser = user;
    },
    resolveSignIn(verificationId: string) {
      const resolve = pendingResolve;
      pendingResolve = null;
      resolve?.({
        verificationId,
        confirm: async () => ({ user: { uid: "uid-late" } }),
      });
    },
  };
}

function pendingDeletion(): AppError {
  return new AppError("account_pending_deletion", "Account deletion is in progress.", undefined, {
    phoneE164: PHONE,
    deletionScheduledFor: "1700000000000",
    deletionPolicyVersion: "3",
    maskedEmail: "o***@example.com",
  });
}

async function main(): Promise<void> {
  assert.equal(PHONE_AUTH_USER_BOUND_MS, 45_000);
  assert.equal(PHONE_NATIVE_SEND_BOUND_MS, 20_000);
  assert.equal(PHONE_NATIVE_CONFIRM_BOUND_MS, 20_000);
  assert.equal(PHONE_ACCOUNT_BOUND_MS, 20_000);
  assert.equal(PHONE_SESSION_BOUND_MS, 20_000);
  assert.equal(PHONE_CLEANUP_BOUND_MS, 3_000);
  assert.equal(REACTIVATION_VERIFY_BOUND_MS, 20_000);

  await testOverallDeadlineStopsALongerStage();
  await testThreeStagesStopAtFortyFiveSeconds();
  await testHungNativeSend();
  await testPermanentlyPendingNativeSend();
  await testMissingActivity();
  await testAuthObjectProbeDoesNotAuthorizeSend();
  await testHungConfirmation();
  await testPermanentlyPendingNativeConfirm();
  await testPendingDeletionOnConfirm();
  await testPendingDeletionOnRetry();
  await testRetryKeepsCapturedEpoch();
  await testRetryFinallyDoesNotClearNewerLoading();
  await testReactivationFinishTimeoutDoesNotPublish();
  await testCachedReactivationReadIsNotAuthority();
  await testPublicationTimeoutRetiresBeforeLateFinish();
  await testNavigationDoesNotWaitOnCleanup();
  console.log("recoverablePhoneAuth.test.ts: ok");
}

async function testOverallDeadlineStopsALongerStage(): Promise<void> {
  const clock = createFakeClock();
  const ops = createPhoneAuthOperations(clock.now, clock.wait);
  const accepted = ops.accept("confirm", 100_000);
  assert.equal(accepted.accepted, true);
  if (!accepted.accepted) return;
  const result = withTimeout(
    ops.bounded(accepted.id, new Promise(() => undefined), 100_000),
    "overall deadline"
  );
  await flush();
  clock.advance(PHONE_AUTH_USER_BOUND_MS);
  await flush();
  assert.equal((await result).status, "unknown", "45s overall deadline stops a longer stage");
}

async function testThreeStagesStopAtFortyFiveSeconds(): Promise<void> {
  const clock = createFakeClock();
  const ops = createPhoneAuthOperations(clock.now, clock.wait);
  const confirmGate = deferred<void>();
  const accountGate = deferred<void>();
  const sessionGate = deferred<void>();
  let attemptId = "";
  let epoch = 4;
  let published = false;
  let navigated = false;
  const viewPromise = submitPhoneVerification({
    ops,
    code: "123456",
    onAccepted: (id) => {
      attemptId = id;
    },
    confirm: async () => {
      await confirmGate.promise;
      return PROFILE;
    },
    continueAccount: async () => {
      await accountGate.promise;
      return { navigate: "account" };
    },
    prepareSession: async () => {
      await sessionGate.promise;
      if (ops.sameAttempt(attemptId) && epoch === 4) {
        published = true;
        navigated = true;
      }
    },
  });
  await flush();
  clock.advance(PHONE_NATIVE_CONFIRM_BOUND_MS - 1_000);
  confirmGate.resolve();
  await flush();
  clock.advance(PHONE_ACCOUNT_BOUND_MS - 1_000);
  accountGate.resolve();
  await flush();
  clock.advance(PHONE_AUTH_USER_BOUND_MS - (PHONE_NATIVE_CONFIRM_BOUND_MS - 1_000) - (PHONE_ACCOUNT_BOUND_MS - 1_000));
  const view = await withTimeout(viewPromise, "session stage");
  assert.equal(view.settlement, "unknown", "session stage settles unknown at the 45s deadline");
  assert.equal(view.navigate, null, "session timeout does not navigate");
  ops.retire();
  epoch += 1;
  sessionGate.resolve();
  await flush();
  assert.equal(published, false, "late session preparation does not publish");
  assert.equal(navigated, false, "late session preparation does not navigate");
}

async function testHungNativeSend(): Promise<void> {
  __clearNativePhoneSessions();
  const activity = {};
  const native = installNative(() => activity);
  const clock = createFakeClock();
  const ops = createPhoneAuthOperations(clock.now, clock.wait);
  let stored = false;
  let rejected = false;
  const raw = startNativePhoneOtp(PHONE);
  void raw.then(
    () => {
      stored = true;
    },
    () => {
      rejected = true;
    }
  );
  await flush();
  assert.equal(native.signInCalls(), 1, "hung send dispatches signInWithPhoneNumber once");
  assert.equal(native.lastPhone(), PHONE);
  const accepted = ops.accept("send", PHONE_NATIVE_SEND_BOUND_MS);
  assert.equal(accepted.accepted, true);
  if (!accepted.accepted) return;
  const bounded = ops.bounded(accepted.id, raw, PHONE_NATIVE_SEND_BOUND_MS);
  await flush();
  clock.advance(PHONE_NATIVE_SEND_BOUND_MS);
  const timed = await withTimeout(bounded, "hung native send");
  assert.equal(timed.status, "unknown");
  retireDispatchedNativeSend();
  ops.settle(accepted.id, "off");
  ops.retire();
  assert.equal(ops.view().busy, false, "Change number releases the send overlay");
  assert.equal(ops.view().overlay, "off", "Change number clears the send overlay");
  const second = startNativePhoneOtp(OTHER);
  void second.then(
    () => undefined,
    () => undefined
  );
  await flush();
  assert.equal(native.signInCalls(), 1, "a second signInWithPhoneNumber is not called while the first is pending");
  native.setUser({ uid: "uid-replacement", phoneNumber: OTHER });
  native.resolveSignIn("vid-late");
  await flush();
  assert.equal(stored, false, "late native send does not store a challenge");
  assert.equal(rejected, true, "late native send is dropped");
  assert.equal(native.signOutCalls(), 0, "late native send does not sign out a replacement session");
  const marker = observePostSendAuthForChallenge({
    verificationId: "vid-late",
    phoneE164: PHONE,
    devCodeHint: null,
  });
  assert.equal(marker, null, "a retired send is not adopted from the native listener");
  const third = startNativePhoneOtp(OTHER);
  void third.then(
    () => undefined,
    () => undefined
  );
  await flush();
  assert.equal(native.signInCalls(), 2, "an eligible new send is admitted exactly once after the hung call settles");
  __clearNativePhoneSessions();
  __installNativePhoneAuthModuleForTests(null);
  __installAndroidActivityBridgeForTests(null);
}

async function testPermanentlyPendingNativeSend(): Promise<void> {
  __clearNativePhoneSessions();
  let activity: object | null = { screen: "phone" };
  const native = installNative(() => activity);
  const clock = createFakeClock();
  const ops = createPhoneAuthOperations(clock.now, clock.wait);
  let stored = false;
  const raw = startNativePhoneOtp(PHONE);
  void raw.then(
    () => {
      stored = true;
    },
    () => undefined
  );
  await flush();
  assert.equal(native.signInCalls(), 1, "the unfinished send is the only native call");
  const accepted = ops.accept("send", PHONE_NATIVE_SEND_BOUND_MS);
  assert.equal(accepted.accepted, true);
  if (!accepted.accepted) return;
  const bounded = ops.bounded(accepted.id, raw, PHONE_NATIVE_SEND_BOUND_MS);
  await flush();
  clock.advance(PHONE_NATIVE_SEND_BOUND_MS);
  const timed = await withTimeout(bounded, "permanently pending send");
  assert.equal(timed.status, "unknown");
  retireDispatchedNativeSend();
  assert.equal(recoverUnsettledNativeSend(), "held", "the same Activity keeps the native slot");
  ops.settle(accepted.id, "off");
  ops.retire();
  assert.equal(ops.view().busy, false, "Change number and Back are not blocked by the unfinished call");
  assert.equal(ops.view().overlay, "off");
  let blocked: unknown = null;
  try {
    await withTimeout(startNativePhoneOtp(OTHER), "held native send");
  } catch (error) {
    blocked = error;
  }
  assert.ok(blocked instanceof AppError);
  assert.equal(native.signInCalls(), 1, "the unfinished call does not overlap a second native send");
  native.setUser({ uid: "uid-replacement", phoneNumber: OTHER });
  assert.equal(
    observePostSendAuthForChallenge({
      verificationId: "vid-never",
      phoneE164: PHONE,
      devCodeHint: null,
    }),
    null,
    "a later auth event does not adopt the retired send"
  );
  assert.equal(stored, false, "the unfinished send does not persist a challenge");
  assert.equal(native.signOutCalls(), 0, "the unfinished send does not sign out a replacement session");
  activity = { screen: "recreated" };
  assert.equal(recoverUnsettledNativeSend(), "recovered", "a replaced Activity releases the slot");
  const next = startNativePhoneOtp(OTHER);
  void next.then(
    () => undefined,
    () => undefined
  );
  await flush();
  assert.equal(native.signInCalls(), 2, "recovery dispatches one new send and leaves the old call pending");
  assert.equal(stored, false, "the old call still has not published");
  assert.equal(native.signOutCalls(), 1, "only the recovered send clears the stale session");
  __clearNativePhoneSessions();
  __installNativePhoneAuthModuleForTests(null);
  __installAndroidActivityBridgeForTests(null);
}

async function testMissingActivity(): Promise<void> {
  __clearNativePhoneSessions();
  let activity: unknown = null;
  const native = installNative(() => activity);
  const clock = createFakeClock();
  const ops = createPhoneAuthOperations(clock.now, clock.wait);
  const accepted = ops.accept("send", PHONE_NATIVE_SEND_BOUND_MS);
  assert.equal(accepted.accepted, true);
  let settled: unknown = null;
  try {
    await withTimeout(startNativePhoneOtp(PHONE), "missing activity");
  } catch (error) {
    settled = error;
  }
  assert.ok(settled instanceof AppError, "missing activity settles an AppError");
  assert.equal((settled as AppError).code, "otp_send_failed");
  assert.equal((settled as AppError).details?.firebaseAuthCode, "auth/missing-activity");
  assert.equal(native.signInCalls(), 0, "missing activity does not call signInWithPhoneNumber");
  if (accepted.accepted) ops.settle(accepted.id, "off");
  assert.equal(ops.view().busy, false, "Change number releases the UI after a missing activity");
  assert.equal(ops.view().overlay, "off");
  activity = {};
  const next = startNativePhoneOtp(OTHER);
  void next.then(
    () => undefined,
    () => undefined
  );
  await flush();
  assert.equal(native.signInCalls(), 1, "an eligible send after missing activity calls the SDK once");
  assert.equal(native.lastPhone(), OTHER);
  assert.equal(native.signOutCalls(), 0);
  __clearNativePhoneSessions();
  __installNativePhoneAuthModuleForTests(null);
  __installAndroidActivityBridgeForTests(null);
}

async function testAuthObjectProbeDoesNotAuthorizeSend(): Promise<void> {
  __clearNativePhoneSessions();
  const native = installNative(() => ({ fromAuthObject: true }));
  __installAndroidActivityBridgeForTests(createAndroidActivityBridge(() => null));
  let settled: unknown = null;
  try {
    await withTimeout(startNativePhoneOtp(PHONE), "probe is not a signal");
  } catch (error) {
    settled = error;
  }
  assert.ok(settled instanceof AppError);
  assert.equal((settled as AppError).details?.firebaseAuthCode, "auth/missing-activity");
  assert.equal(native.signInCalls(), 0, "an auth-object probe does not authorize signInWithPhoneNumber");
  __clearNativePhoneSessions();
  __installNativePhoneAuthModuleForTests(null);
  __installAndroidActivityBridgeForTests(null);
}

async function testHungConfirmation(): Promise<void> {
  __clearNativePhoneSessions();
  const activity = { screen: "otp" };
  const native = installNative(() => activity);
  const confirmGate = deferred<{ user: { uid: string } }>();
  let confirmCalls = 0;
  const challenge: OtpChallenge = {
    verificationId: "vid-confirm",
    phoneE164: PHONE,
    devCodeHint: null,
  };
  __seedPendingSessionForTests({
    confirmation: {
      verificationId: challenge.verificationId,
      confirm: () => {
        confirmCalls += 1;
        return confirmGate.promise;
      },
    } as never,
    firebaseVerificationId: challenge.verificationId,
    phoneE164: PHONE,
    expiresAt: Date.now() + 60_000,
    attemptId: "attempt-confirm",
    startedAtMs: Date.now() - 1_000,
    preSendUid: null,
    autoVerify: null,
    sendGeneration: 0,
  });
  const clock = createFakeClock();
  const ops = createPhoneAuthOperations(clock.now, clock.wait);
  let publishedUid: string | null = null;
  let navigated = false;
  const viewPromise = submitPhoneVerification({
    ops,
    code: "123456",
    confirm: () =>
      confirmNativePhoneOtp(challenge, "123456").then((uid) => {
        publishedUid = uid;
        return PROFILE;
      }),
    continueAccount: async () => {
      navigated = true;
      return { navigate: "account" };
    },
  });
  await flush();
  assert.equal(confirmCalls, 1, "hung confirmation dispatches the native confirm once");
  const second = confirmNativePhoneOtp(challenge, "123456");
  void second.then(
    () => undefined,
    () => undefined
  );
  await flush();
  assert.equal(confirmCalls, 1, "a second confirm is not dispatched while the first is pending");
  clock.advance(PHONE_NATIVE_CONFIRM_BOUND_MS);
  const view = await withTimeout(viewPromise, "hung confirmation");
  assert.equal(view.settlement, "unknown");
  assert.equal(view.navigate, null, "hung confirmation does not navigate");
  ops.retire();
  retireDispatchedNativeSend();
  retireDispatchedNativeConfirm();
  native.setUser({ uid: "uid-replacement", phoneNumber: PHONE });
  confirmGate.resolve({ user: { uid: "uid-late-confirm" } });
  await flush();
  assert.equal(publishedUid, null, "late confirm callback does not publish");
  assert.equal(navigated, false, "late confirm callback does not navigate");
  assert.equal(native.signOutCalls(), 0, "late confirm does not sign out a replacement session");
  assert.equal(observePostSendAuthForChallenge(challenge), null, "retired confirmation is not adopted");
  __clearNativePhoneSessions();
  __installNativePhoneAuthModuleForTests(null);
  __installAndroidActivityBridgeForTests(null);
}

async function testPermanentlyPendingNativeConfirm(): Promise<void> {
  __clearNativePhoneSessions();
  let activity: object | null = { screen: "otp" };
  const native = installNative(() => activity);
  let confirmCalls = 0;
  const challenge: OtpChallenge = {
    verificationId: "vid-confirm-permanent",
    phoneE164: PHONE,
    devCodeHint: null,
  };
  __seedPendingSessionForTests({
    confirmation: {
      verificationId: challenge.verificationId,
      confirm: () => {
        confirmCalls += 1;
        return new Promise(() => undefined);
      },
    } as never,
    firebaseVerificationId: challenge.verificationId,
    phoneE164: PHONE,
    expiresAt: Date.now() + 60_000,
    attemptId: "attempt-confirm-permanent",
    startedAtMs: Date.now() - 1_000,
    preSendUid: null,
    autoVerify: null,
    sendGeneration: 0,
  });
  const clock = createFakeClock();
  const ops = createPhoneAuthOperations(clock.now, clock.wait);
  let publishedUid: string | null = null;
  let navigated = false;
  const viewPromise = submitPhoneVerification({
    ops,
    code: "123456",
    confirm: () =>
      confirmNativePhoneOtp(challenge, "123456").then((uid) => {
        publishedUid = uid;
        return PROFILE;
      }),
    continueAccount: async () => {
      navigated = true;
      return { navigate: "account" };
    },
  });
  await flush();
  assert.equal(confirmCalls, 1);
  const second = confirmNativePhoneOtp(challenge, "123456");
  void second.then(
    () => undefined,
    () => undefined
  );
  await flush();
  clock.advance(PHONE_NATIVE_CONFIRM_BOUND_MS);
  const view = await withTimeout(viewPromise, "permanently pending confirmation");
  assert.equal(view.settlement, "unknown");
  assert.equal(view.navigate, null);
  ops.retire();
  retireDispatchedNativeSend();
  retireDispatchedNativeConfirm();
  assert.equal(recoverUnsettledNativeConfirm(), "held");
  assert.equal(ops.view().busy, false, "Back is available while confirmation never settles");
  assert.equal(confirmCalls, 1, "the unfinished confirmation is not called again");
  native.setUser({ uid: "uid-replacement", phoneNumber: PHONE });
  assert.equal(observePostSendAuthForChallenge(challenge), null);
  assert.equal(publishedUid, null);
  assert.equal(navigated, false);
  assert.equal(native.signOutCalls(), 0);
  activity = { screen: "recreated" };
  assert.equal(recoverUnsettledNativeConfirm(), "recovered");
  let retired: unknown = null;
  try {
    await withTimeout(confirmNativePhoneOtp(challenge, "123456"), "retired confirmation");
  } catch (error) {
    retired = error;
  }
  assert.ok(retired instanceof AppError, "the retired challenge is not confirmed on the new Activity");
  assert.equal(confirmCalls, 1, "the unfinished confirmation is not dispatched again");
  assert.equal(publishedUid, null, "the unfinished confirmation still has not published");
  assert.equal(navigated, false);
  __clearNativePhoneSessions();
  __installNativePhoneAuthModuleForTests(null);
  __installAndroidActivityBridgeForTests(null);
}

async function testPendingDeletionOnConfirm(): Promise<void> {
  const ops = createPhoneAuthOperations(() => 0);
  let continued = false;
  const view = await submitPhoneVerification({
    ops,
    code: "123456",
    phoneE164: PHONE,
    confirm: async () => {
      throw pendingDeletion();
    },
    continueAccount: async () => {
      continued = true;
      return { navigate: "account" };
    },
  });
  assert.equal(continued, false);
  assert.equal(view.settlement, "reactivation");
  assert.notEqual(view.settlement, "account_failed");
  assert.notEqual(view.settlement, "invalid");
  assert.equal(view.clearCode, false);
  assert.equal(view.navigate, "reactivation");
  assert.deepEqual(view.reactivation, {
    phoneE164: PHONE,
    deletionScheduledFor: "1700000000000",
    deletionPolicyVersion: "3",
    maskedEmail: "o***@example.com",
  });
}

async function testPendingDeletionOnRetry(): Promise<void> {
  const ops = createPhoneAuthOperations(() => 0);
  let bridged = false;
  let failedCode = "";
  const result = await retryAuthenticatedAccountSetup({
    ops,
    phoneE164: PHONE,
    inFlight: false,
    captureEpoch: () => 2,
    readLive: () => ({ uid: PROFILE.uid, generation: 1, epoch: 2 }),
    begin: () => undefined,
    end: () => undefined,
    resolveAccount: async () => {
      throw pendingDeletion();
    },
    requireBridge: async () => {
      bridged = true;
    },
    applyServerProfile: async () => undefined,
    continueAfterProfile: async () => undefined,
    onInactiveSession: () => undefined,
    onFailure: (error) => {
      failedCode = error instanceof AppError ? error.code : "unknown";
    },
  });
  assert.equal(bridged, false);
  assert.equal(result, "reactivation", "account-setup retry routes pending deletion");
  assert.equal(failedCode, "account_pending_deletion");
  assert.notEqual(failedCode, "invalid_otp");
}

async function testRetryKeepsCapturedEpoch(): Promise<void> {
  const stable = createPhoneAuthOperations(() => 0);
  let appliedEpoch: number | undefined;
  const continued = await retryAuthenticatedAccountSetup({
    ops: stable,
    phoneE164: PHONE,
    inFlight: false,
    captureEpoch: () => 4,
    readLive: () => ({ uid: PROFILE.uid, generation: 3, epoch: 4 }),
    begin: () => undefined,
    end: () => undefined,
    resolveAccount: async (_phone, ownership) => {
      assert.equal(ownership.epoch, 4);
      return { profile: PROFILE };
    },
    requireBridge: async (_ownership) => undefined,
    applyServerProfile: async (_profile, ownership) => {
      appliedEpoch = ownership.epoch;
    },
    continueAfterProfile: async (_profile, ownership) => {
      assert.equal(ownership.epoch, 4);
    },
    onInactiveSession: () => undefined,
    onFailure: () => undefined,
  });
  assert.equal(continued, "continued");
  assert.equal(appliedEpoch, 4, "retry threads the epoch captured at accept");

  const ops = createPhoneAuthOperations(() => 0);
  let liveEpoch = 4;
  let applied = false;
  const replaced = await retryAuthenticatedAccountSetup({
    ops,
    phoneE164: PHONE,
    inFlight: false,
    captureEpoch: () => 4,
    readLive: () => ({ uid: PROFILE.uid, generation: 3, epoch: liveEpoch }),
    begin: () => undefined,
    end: () => undefined,
    resolveAccount: async () => {
      liveEpoch = 9;
      return { profile: PROFILE };
    },
    requireBridge: async () => undefined,
    applyServerProfile: async (_profile, ownership) => {
      applied = true;
      assert.notEqual(ownership.epoch, 9);
    },
    continueAfterProfile: async () => undefined,
    onInactiveSession: () => undefined,
    onFailure: () => undefined,
  });
  assert.equal(replaced, "failed", "a retry does not adopt a replacement epoch");
  assert.equal(applied, false);
}

async function testRetryFinallyDoesNotClearNewerLoading(): Promise<void> {
  const ops = createPhoneAuthOperations(() => 0);
  const gate = deferred<void>();
  let loading = false;
  let ended = 0;
  const pending = retryAuthenticatedAccountSetup({
    ops,
    phoneE164: PHONE,
    inFlight: false,
    captureEpoch: () => 4,
    readLive: () => ({ uid: PROFILE.uid, generation: 3, epoch: 4 }),
    begin: () => {
      loading = true;
    },
    end: () => {
      ended += 1;
      loading = false;
    },
    resolveAccount: async () => {
      await gate.promise;
      return { profile: PROFILE };
    },
    requireBridge: async () => undefined,
    applyServerProfile: async () => {
      throw new Error("old retry adopted the replacement");
    },
    continueAfterProfile: async () => undefined,
    onInactiveSession: () => undefined,
    onFailure: () => undefined,
  });
  await flush();
  ops.retire();
  loading = true;
  const newer = ops.accept("account", PHONE_ACCOUNT_BOUND_MS);
  assert.equal(newer.accepted, true);
  gate.resolve();
  const result = await pending;
  assert.equal(result, "failed");
  assert.equal(ended, 0, "old retry finally does not clear a newer operation");
  assert.equal(loading, true);
  assert.equal(ops.view().busy, true);
  assert.equal(ops.view().overlay, "verifying");
}

async function testReactivationFinishTimeoutDoesNotPublish(): Promise<void> {
  const gate = deferred<void>();
  let published = false;
  let epoch = 3;
  let retired = 0;
  let completes = 0;
  const controller = createReactivationEmailVerification();
  const view = await controller.submit({
    code: "010203",
    challengeId: "challenge-synthetic",
    online: true,
    isCurrent: () => true,
    complete: async () => {
      completes += 1;
      return PROFILE;
    },
    finish: async (_profile, still) => {
      await gate.promise;
      if (!still() || epoch !== 3) return;
      published = true;
    },
    readAccount: async () => ({ status: "unknown" }),
    messageFor: () => "rejected",
    offlineMessage: "offline",
    unknownMessage: "unknown-result",
    localFailureMessage: "local-failed",
    timeoutMs: 25,
    retireClaim: () => {
      retired += 1;
      epoch += 1;
    },
  });
  assert.equal(view.outcome, "unknown", "finish timeout is unknown, not verified");
  assert.equal(view.navigate, false);
  assert.equal(retired, 1, "finish timeout retires the publication claim");
  assert.equal(completes, 1, "finish timeout does not submit another email code");
  gate.resolve();
  await flush();
  assert.equal(published, false, "late finishReactivation does not publish");
}

async function testCachedReactivationReadIsNotAuthority(): Promise<void> {
  const cached = await reactivationAccountFromServerRead({
    source: "cache",
    exists: true,
    uid: PROFILE.uid,
    data: { status: "active", phoneE164: PHONE },
  });
  assert.equal(cached.status, "unknown", "a cached account document is not authority");
  const unavailable = await reactivationAccountFromServerRead("unavailable");
  assert.equal(unavailable.status, "unknown");
  const pending = await reactivationAccountFromServerRead({
    source: "server",
    exists: true,
    uid: PROFILE.uid,
    data: { status: "pending_deletion" },
  });
  assert.equal(pending.status, "pending_deletion");
  const active = await reactivationAccountFromServerRead({
    source: "server",
    exists: true,
    uid: PROFILE.uid,
    data: { status: "active", phoneE164: PHONE, ueid: "UEID1" },
  });
  assert.equal(active.status, "active");

  let completes = 0;
  let finishes = 0;
  const controller = createReactivationEmailVerification();
  const input = {
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
      throw new Error("local");
    },
    readAccount: async () =>
      reactivationAccountFromServerRead({
        source: "cache",
        exists: true,
        uid: PROFILE.uid,
        data: { status: "active", phoneE164: PHONE },
      }),
    messageFor: () => "rejected",
    offlineMessage: "offline",
    unknownMessage: "unknown-result",
    localFailureMessage: "local-failed",
    timeoutMs: 40,
  };
  const first = await controller.submit(input);
  assert.equal(first.outcome, "local_failed");
  const second = await controller.submit(input);
  assert.equal(second.outcome, "unknown");
  assert.equal(second.navigate, false);
  assert.equal(completes, 1, "an unknown cached account does not submit another email code");
  assert.equal(finishes, 1);
}

async function testPublicationTimeoutRetiresBeforeLateFinish(): Promise<void> {
  const clock = createFakeClock();
  const gate = deferred<void>();
  let epoch = 1;
  let published = false;
  const resultPromise = raceOwnedPublication({
    budgetMs: 25,
    wait: clock.wait,
    retireClaim: () => {
      epoch += 1;
    },
    run: async () => {
      await gate.promise;
      if (epoch === 1) published = true;
      return "session";
    },
  });
  await flush();
  clock.advance(25);
  const result = await withTimeout(resultPromise, "publication budget");
  assert.equal(result.status, "unknown");
  assert.equal(epoch, 2, "publication timeout retires the claim before the late finish");
  gate.resolve();
  await flush();
  assert.equal(published, false, "late publication does not save the session");
}

async function testNavigationDoesNotWaitOnCleanup(): Promise<void> {
  let navigated = false;
  const hung = await leaveAuthenticatedPhoneChallenge({
    stillCurrent: () => true,
    navigate: () => {
      navigated = true;
    },
    clear: () => new Promise(() => undefined),
    boundMs: 20,
  });
  assert.equal(hung, "left", "a hung cleanup still leaves the OTP screen");
  assert.equal(navigated, true);

  let rejectedNavigated = false;
  const rejected = await leaveAuthenticatedPhoneChallenge({
    stillCurrent: () => true,
    navigate: () => {
      rejectedNavigated = true;
    },
    clear: async () => {
      throw new Error("cleanup failed");
    },
    boundMs: 20,
  });
  assert.equal(rejected, "left", "a rejected cleanup still leaves the OTP screen");
  assert.equal(rejectedNavigated, true);

  let staleNavigated = false;
  let staleCleared = false;
  const stale = await leaveAuthenticatedPhoneChallenge({
    stillCurrent: () => false,
    navigate: () => {
      staleNavigated = true;
    },
    clear: async () => {
      staleCleared = true;
    },
  });
  assert.equal(stale, "stale");
  assert.equal(staleNavigated, false);
  assert.equal(staleCleared, false);

  let current: string | null = "old";
  let wiped = false;
  await leaveAuthenticatedPhoneChallenge({
    stillCurrent: () => current === "old",
    navigate: () => {
      current = "left";
    },
    clear: async () => {
      if (current !== "old") return;
      wiped = true;
      current = null;
    },
    boundMs: 20,
  });
  assert.equal(wiped, false, "cleanup does not clear a newer challenge");
  assert.equal(current, "left");
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
