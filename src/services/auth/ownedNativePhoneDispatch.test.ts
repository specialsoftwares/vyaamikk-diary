/** Production JS adapter with synthetic native I/O; this is not Android acceptance. */
import assert from "node:assert/strict";
import {
  __clearNativePhoneSessions, __installNativePhoneAuthModuleForTests,
  __installAndroidActivityBridgeForTests, __seedPendingSessionForTests,
  createAndroidActivityBridge, startNativePhoneOtp, confirmNativePhoneOtp,
  retireDispatchedNativeSend, retireDispatchedNativeConfirm, observePostSendAuthForChallenge,
} from "./nativePhoneAuth";
import type { PhoneE164 } from "@/domain/types";

const PHONE = "+919800000009" as PhoneE164;
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(r => { resolve = r; });
  return { promise, resolve };
}
async function flush() { for (let i = 0; i < 8; i++) await Promise.resolve(); }
function fixture() {
  __clearNativePhoneSessions();
  let user: { uid: string; phoneNumber: string } | null = null;
  let activity = "41";
  let sends = 0;
  let proof: string | null = null;
  let signOut: () => Promise<void> = async () => { user = null; };
  const auth = {
    settings: {}, get currentUser() { return user; },
    signOut: () => signOut(),
    signInWithPhoneNumber: async () => ({ verificationId: `send-${++sends}` }),
    onAuthStateChanged: () => () => undefined,
  };
  const bridge = { ...createAndroidActivityBridge(() => ({ id: activity })), verificationProof: () => proof };
  __installNativePhoneAuthModuleForTests({ platform: "android", module: { default: () => auth, PhoneAuthProvider: {} } as never });
  __installAndroidActivityBridgeForTests(bridge);
  return {
    setUser: (value: typeof user) => { user = value; },
    setActivity: (value: string) => { activity = value; },
    setSignOut: (value: () => Promise<void>) => { signOut = value; },
    setProof: (value: string | null) => { proof = value; },
    sends: () => sends,
  };
}
async function retiredPreparationCannotDispatch() {
  const f = fixture();
  f.setUser({ uid: "old-user", phoneNumber: PHONE });
  const preparation = deferred<void>();
  f.setSignOut(async () => { await preparation.promise; f.setUser(null); });
  const send = startNativePhoneOtp(PHONE);
  const rejected = assert.rejects(send, /no longer current/);
  await flush();
  retireDispatchedNativeSend();
  preparation.resolve();
  await rejected;
  assert.equal(f.sends(), 0, "retirement before dispatch sends no SMS request");
}
async function changedActivityBeforeDispatchIsRejected() {
  const f = fixture();
  f.setUser({ uid: "old-user", phoneNumber: PHONE });
  const preparation = deferred<void>();
  f.setSignOut(async () => { await preparation.promise; f.setUser(null); });
  const send = startNativePhoneOtp(PHONE);
  const rejected = assert.rejects(send);
  await flush();
  f.setActivity("42");
  preparation.resolve();
  await rejected;
  assert.equal(f.sends(), 0);
}
async function pendingConfirmationPreventsNewSamePhoneSend() {
  const f = fixture();
  const old = deferred<{ user: { uid: string } }>();
  const challenge = { verificationId: "old-A", phoneE164: PHONE, devCodeHint: null };
  __seedPendingSessionForTests({
    confirmation: { verificationId: "old-A", confirm: () => old.promise } as never,
    firebaseVerificationId: "old-A", phoneE164: PHONE, expiresAt: Date.now() + 60_000,
    attemptId: "A", startedAtMs: Date.now(), preSendUid: null, autoVerify: null, sendGeneration: 0,
  });
  const confirmation = confirmNativePhoneOtp(challenge, "123456");
  const retired = assert.rejects(confirmation, /no longer current/);
  await flush();
  retireDispatchedNativeSend(); retireDispatchedNativeConfirm();
  await assert.rejects(startNativePhoneOtp(PHONE), /still finishing/);
  f.setActivity("42");
  await assert.rejects(startNativePhoneOtp(PHONE), /still finishing/);
  assert.equal(f.sends(), 0, "Activity replacement is not credential-task cancellation");
  f.setUser({ uid: "uid-old-A", phoneNumber: PHONE });
  old.resolve({ user: { uid: "uid-old-A" } });
  await retired;
  const next = await startNativePhoneOtp(PHONE);
  f.setUser({ uid: "uid-old-A", phoneNumber: PHONE });
  assert.equal(observePostSendAuthForChallenge(next), null, "matching global auth user is not native-owned proof");
  f.setProof(JSON.stringify({ verificationId: "old-A", uid: "uid-old-A", phone: PHONE }));
  assert.equal(observePostSendAuthForChallenge(next), null, "another challenge's native proof is refused");
  f.setProof(JSON.stringify({ verificationId: next.verificationId, uid: "uid-old-A", phone: PHONE }));
  assert.equal(observePostSendAuthForChallenge(next)?.verificationId, next.verificationId);
}
async function main() {
  try {
    await retiredPreparationCannotDispatch();
    await changedActivityBeforeDispatchIsRejected();
    await pendingConfirmationPreventsNewSamePhoneSend();
    console.log("ownedNativePhoneDispatch.test.ts: ok");
  } finally {
    __clearNativePhoneSessions();
    __installAndroidActivityBridgeForTests(null);
    __installNativePhoneAuthModuleForTests(null);
  }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
