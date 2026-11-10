/** Production contact adapter and native barrier, with synthetic platform I/O. */
import assert from "node:assert/strict";
import {
  __clearNativePhoneSessions, __installNativePhoneAuthModuleForTests,
  __installAndroidActivityBridgeForTests, createAndroidActivityBridge,
  restorePendingPhoneSessionForResume, confirmNativePhoneOtp, startNativePhoneOtp,
} from "./nativePhoneAuth";
import {
  __installNativePhoneContactChangeModuleForTests, resetNativePhoneContactChangeForTests,
  startNativePhoneContactChangeOtp, confirmNativePhoneContactChangeUpdate,
  retireNativePhoneContactChange,
} from "./nativePhoneContactChange";
import { saveNativePhoneAuthSession, clearNativePhoneAuthSession, loadNativePhoneAuthSession } from "./nativePhoneAuthSession";
import { beginSessionCommit } from "./authSessionFence";
import type { PhoneE164 } from "@/domain/types";

const OLD = "+919800000051" as PhoneE164;
const NEW = "+919800000052" as PhoneE164;
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { resolve, promise }; }
async function tick() { for (let i = 0; i < 8; i++) await Promise.resolve(); }
async function fixture() {
  __clearNativePhoneSessions(); resetNativePhoneContactChangeForTests(); await clearNativePhoneAuthSession();
  let user: { uid: string; phoneNumber: string; updatePhoneNumber: () => Promise<void>; getIdToken: () => Promise<string> } | null = {
    uid: "owner-a", phoneNumber: OLD, updatePhoneNumber: async () => { if (user) user.phoneNumber = NEW; }, getIdToken: async () => "test-token",
  };
  let updates = 0;
  let onSnapshot: ((snapshot: unknown) => void) | null = null;
  const auth = {
    settings: {}, get currentUser() { return user; }, signOut: async () => { user = null; },
    verifyPhoneNumber: () => ({ on: (_event: string, callback: (snapshot: unknown) => void) => { onSnapshot = callback; return {}; } }),
  };
  const mod = { default: () => auth, PhoneAuthProvider: { credential: () => ({ providerId: "phone", token: "fixture", secret: "fixture" }) } };
  const bridge = {
    ...createAndroidActivityBridge(() => ({ id: "51" })),
    updateVerifiedPhone: async () => { updates++; await user!.updatePhoneNumber(); return user!.uid; },
  };
  __installNativePhoneAuthModuleForTests({ platform: "android", module: mod as never });
  __installNativePhoneContactChangeModuleForTests(mod as never);
  __installAndroidActivityBridgeForTests(bridge);
  return {
    sent: () => onSnapshot!({ state: "sent", verificationId: "contact-vid", code: null, error: null }),
    user: () => user!, updates: () => updates,
    setUid: (uid: string) => { if (user) user.uid = uid; },
  };
}
async function contactChallengeIsNotLogin() {
  const f = await fixture();
  const sending = startNativePhoneContactChangeOtp(NEW); f.sent();
  const challenge = await sending;
  const stored = await loadNativePhoneAuthSession();
  assert.equal(stored?.purpose, "contact_change");
  assert.equal(stored?.expectedUid, "owner-a");
  assert.equal(await restorePendingPhoneSessionForResume(challenge.verificationId, NEW), false);
  await assert.rejects(confirmNativePhoneOtp(challenge, "123456"));
  assert.equal(f.updates(), 0);
  f.setUid("owner-b");
  resetNativePhoneContactChangeForTests();
  await assert.rejects(confirmNativePhoneContactChangeUpdate(challenge, "123456"));
  assert.equal(f.updates(), 0, "persisted challenge cannot acquire a replacement UID");
}
async function retiredSendCannotPersist() {
  const f = await fixture();
  const sending = startNativePhoneContactChangeOtp(NEW);
  retireNativePhoneContactChange(); f.sent();
  await assert.rejects(sending);
  assert.equal(await loadNativePhoneAuthSession(), null);
}
async function contactMutationSharesLoginBarrier() {
  const f = await fixture();
  const sending = startNativePhoneContactChangeOtp(NEW); f.sent(); const challenge = await sending;
  const task = deferred<void>();
  f.user().updatePhoneNumber = async () => { await task.promise; f.user().phoneNumber = NEW; };
  const confirming = confirmNativePhoneContactChangeUpdate(challenge, "123456");
  const rejected = assert.rejects(confirming);
  await tick();
  assert.equal(f.updates(), 1);
  retireNativePhoneContactChange();
  await assert.rejects(startNativePhoneOtp(NEW), /still finishing/);
  // A replacement saved challenge survives old cleanup / completion.
  await saveNativePhoneAuthSession({ firebaseVerificationId: "new-login", phoneE164: OLD, expiresAt: Date.now() + 60_000, attemptId: "next", purpose: "phone_login" });
  task.resolve(); await rejected;
  assert.equal((await loadNativePhoneAuthSession())?.firebaseVerificationId, "new-login");
}
async function sameUidReplacementDuringTokenRefreshCannotPublish() {
  const f = await fixture();
  const sending = startNativePhoneContactChangeOtp(NEW); f.sent(); const challenge = await sending;
  const token = deferred<string>(); f.user().getIdToken = () => token.promise;
  const confirming = confirmNativePhoneContactChangeUpdate(challenge, "123456");
  const rejected = assert.rejects(confirming);
  await tick(); beginSessionCommit(); token.resolve("test-token"); await rejected;
  assert.equal((await loadNativePhoneAuthSession())?.firebaseVerificationId, challenge.verificationId, "unknown outcome remains available for reconciliation");
}
async function main() {
  try {
    await contactChallengeIsNotLogin();
    await retiredSendCannotPersist();
    await contactMutationSharesLoginBarrier();
    await sameUidReplacementDuringTokenRefreshCannotPublish();
    console.log("nativePhoneContactOwnership.test.ts: ok");
  } finally {
    __installNativePhoneContactChangeModuleForTests(null); __installNativePhoneAuthModuleForTests(null);
    __installAndroidActivityBridgeForTests(null); __clearNativePhoneSessions(); resetNativePhoneContactChangeForTests();
  }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
