/** Production restore and cleanup boundaries with synthetic SecureStore I/O. */
import assert from "node:assert/strict";
import Module from "node:module";
import {
  __clearNativePhoneSessions, __installNativePhoneAuthModuleForTests, __installAndroidActivityBridgeForTests,
  __seedPendingSessionForTests, createAndroidActivityBridge, confirmNativePhoneOtp,
  restorePendingPhoneSessionForResume, retireDispatchedNativeSend, retireDispatchedNativeConfirm,
} from "./nativePhoneAuth";
import { saveNativePhoneAuthSession, clearNativePhoneAuthSession, loadNativePhoneAuthSession } from "./nativePhoneAuthSession";

const PHONE = "+919800000061";
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }
const data = new Map<string, string>();
let held: { started: ReturnType<typeof deferred<void>>; release: ReturnType<typeof deferred<void>> } | null = null;
const storage = {
  async getItemAsync(key: string) {
    const value = data.get(key) ?? null;
    const capture = held; held = null;
    if (capture) { capture.started.resolve(); await capture.release.promise; }
    return value;
  },
  async setItemAsync(key: string, value: string) { data.set(key, value); },
  async deleteItemAsync(key: string) { data.delete(key); },
};
const original = Module.prototype.require;
Module.prototype.require = function (this: NodeJS.Module, id: string) {
  if (id === "react-native") return { Platform: { OS: "android" } };
  if (id === "expo-secure-store") return storage;
  return original.call(this, id);
};
const row = (id: string) => ({ firebaseVerificationId: id, phoneE164: PHONE, expiresAt: Date.now() + 60_000, attemptId: id, purpose: "phone_login" as const });
function holdRead() { const capture = { started: deferred<void>(), release: deferred<void>() }; held = capture; return capture; }
async function reset() { __clearNativePhoneSessions(); await clearNativePhoneAuthSession(); await saveNativePhoneAuthSession(row("old-A")); }
async function restoreCannotAdoptRetiredRead() {
  await reset(); const read = holdRead();
  const restoring = restorePendingPhoneSessionForResume("old-A", PHONE);
  await read.started.promise; retireDispatchedNativeSend(); await saveNativePhoneAuthSession(row("new-B")); read.release.resolve();
  assert.equal(await restoring, false, "retired load cannot restore an old in-memory challenge");
  assert.equal(await restorePendingPhoneSessionForResume("new-B", PHONE), true, "old insertion must not block the newer challenge");
}
async function retiredMemoryCannotResumeFromItsOwnPersistedCopy() {
  await reset();
  assert.equal(await restorePendingPhoneSessionForResume("old-A", PHONE), true);
  retireDispatchedNativeSend();
  assert.equal(await restorePendingPhoneSessionForResume("old-A", PHONE), false,
    "retired in-memory challenge cannot regain authority from the same saved row");
}
async function confirmationCannotDispatchAfterRetiredRead() {
  await reset(); const read = holdRead();
  const confirming = confirmNativePhoneOtp({ verificationId: "old-A", phoneE164: PHONE, devCodeHint: null }, "123456");
  const rejected = assert.rejects(confirming);
  await read.started.promise; retireDispatchedNativeConfirm(); await saveNativePhoneAuthSession(row("new-B")); read.release.resolve();
  await rejected;
  assert.equal(await restorePendingPhoneSessionForResume("new-B", PHONE), true);
}
async function autoConfirmationCannotPublishAfterCleanupRetirement() {
  await reset();
  const now = Date.now();
  __seedPendingSessionForTests({
    ...row("old-A"), confirmation: null, startedAtMs: now - 10, preSendUid: null, sendGeneration: 0,
    autoVerify: { attemptId: "old-A", verificationId: "old-A", challengePhoneE164: PHONE, authenticatedUid: "owner-a", challengeStartedAtMs: now - 10, authenticatedAtMs: now },
  });
  const read = holdRead();
  const confirming = confirmNativePhoneOtp({ verificationId: "old-A", phoneE164: PHONE, devCodeHint: null }, "");
  const rejected = assert.rejects(confirming);
  await read.started.promise;
  retireDispatchedNativeSend(); retireDispatchedNativeConfirm();
  const saving = saveNativePhoneAuthSession(row("new-B")); read.release.resolve();
  await rejected; await saving;
  assert.equal((await loadNativePhoneAuthSession())?.firebaseVerificationId, "new-B");
}
async function main() {
  const auth = { currentUser: { uid: "owner-a", phoneNumber: PHONE }, settings: {}, onAuthStateChanged: () => () => undefined };
  __installNativePhoneAuthModuleForTests({ platform: "android", module: { default: () => auth } as never });
  __installAndroidActivityBridgeForTests({ ...createAndroidActivityBridge(() => ({ id: "61" })), verificationProof: () => JSON.stringify({ verificationId: "old-A", uid: "owner-a", phone: PHONE }) });
  try {
    await restoreCannotAdoptRetiredRead();
    await retiredMemoryCannotResumeFromItsOwnPersistedCopy();
    await confirmationCannotDispatchAfterRetiredRead();
    await autoConfirmationCannotPublishAfterCleanupRetirement();
    console.log("nativePhoneRestoreOwnership.test.ts: ok");
  } finally {
    Module.prototype.require = original;
    __installNativePhoneAuthModuleForTests(null); __installAndroidActivityBridgeForTests(null); __clearNativePhoneSessions();
  }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
