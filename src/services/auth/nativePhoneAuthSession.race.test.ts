/**
 * Production loader race.
 * Storage is a synthetic SecureStore. loadNativePhoneAuthSession, save, clear,
 * and resumeSignedOutPhoneChallenge are the production functions.
 * The held read observes expired session A, then a valid session B is saved
 * before that read is released.
 */
import assert from "node:assert/strict";
import Module from "node:module";

import { resumeSignedOutPhoneChallenge } from "@/auth-v2/signedOutChallengeResume";

const KEY = "vyd_native_phone_auth_session_v1";
const PHONE_A = "+919800000011";
const PHONE_B = "+919800000012";
const ID_A = "native-session-a";
const ID_B = "native-session-b";

const storage = new Map<string, string>();
let releaseRead: (() => void) | null = null;
let markReadHeld: (() => void) | null = null;
let holdFirstRead = true;

const secureStore = {
  async getItemAsync(key: string): Promise<string | null> {
    const snapshot = storage.get(key) ?? null;
    if (holdFirstRead) {
      holdFirstRead = false;
      markReadHeld?.();
      await new Promise<void>((resolve) => {
        releaseRead = resolve;
      });
    }
    return snapshot;
  },
  async setItemAsync(key: string, value: string): Promise<void> {
    storage.set(key, value);
  },
  async deleteItemAsync(key: string): Promise<void> {
    storage.delete(key);
  },
};

const originalRequire = Module.prototype.require;
Module.prototype.require = function patchedRequire(this: NodeJS.Module, id: string) {
  if (id === "react-native") return { Platform: { OS: "android" } };
  if (id === "expo-secure-store") return secureStore;
  return originalRequire.apply(this, arguments as unknown as [string]);
};

async function main() {
  const session = await import("./nativePhoneAuthSession");
  const now = Date.now();
  await session.saveNativePhoneAuthSession({
    firebaseVerificationId: ID_A,
    phoneE164: PHONE_A,
    expiresAt: now - 1_000,
    attemptId: "attempt-a",
  });

  const readHeld = new Promise<void>((resolve) => {
    markReadHeld = resolve;
  });
  const expiredRead = session.loadNativePhoneAuthSession();
  await Promise.race([
    readHeld,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error("expired read was not held")), 1_000);
    }),
  ]);

  await session.saveNativePhoneAuthSession({
    firebaseVerificationId: ID_B,
    phoneE164: PHONE_B,
    expiresAt: now + 60_000,
    attemptId: "attempt-b",
  });
  releaseRead?.();
  assert.equal(await expiredRead, null, "expired session A is not usable");

  const readable = await session.loadNativePhoneAuthSession();
  assert.equal(readable?.firebaseVerificationId, ID_B);
  assert.equal(readable?.phoneE164, PHONE_B);
  assert.equal(storage.get(KEY)?.includes(ID_B), true);

  const resumed = await resumeSignedOutPhoneChallenge({
    loadWrapper: async () => ({
      phoneE164: PHONE_B,
      verificationId: ID_B,
      devCodeHint: null,
    }),
    loadDigits: async () => null,
  });
  assert.equal(resumed.action, "resume");
  if (resumed.action === "resume") {
    assert.equal(resumed.verificationId, ID_B);
    assert.equal(resumed.resendAvailableAt, null);
  }

  await session.clearNativePhoneAuthSession();
  assert.equal(await session.loadNativePhoneAuthSession(), null);
  assert.equal(storage.has(KEY), false);

  await session.saveNativePhoneAuthSession({
    firebaseVerificationId: ID_B,
    phoneE164: PHONE_B,
    expiresAt: now + 60_000,
    attemptId: "attempt-valid",
  });
  const valid = await session.loadNativePhoneAuthSession();
  assert.equal(valid?.firebaseVerificationId, ID_B);

  console.log("nativePhoneAuthSession.race.test.ts: ok");
}

void main();
