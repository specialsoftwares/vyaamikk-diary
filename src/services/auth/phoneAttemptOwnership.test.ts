/**
 * Attempt ownership for restoration, publication, and same-UID replacement.
 * Synthetic phones only. Run: npx tsx src/services/auth/phoneAttemptOwnership.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  PHONE_ACCOUNT_BOUND_MS,
  PHONE_AUTH_USER_BOUND_MS,
  PHONE_CLEANUP_BOUND_MS,
  PHONE_NATIVE_CONFIRM_BOUND_MS,
  PHONE_NATIVE_SEND_BOUND_MS,
  PHONE_SESSION_BOUND_MS,
  openRestoredPhoneChallenge,
} from "@/auth-v2/phoneAuthOperation";
import { phoneProfileOwnershipHeld } from "@/auth-v2/phoneProfileContinuation";
import {
  commitAfterLocalReadiness,
  openRetainedSession,
  requireReadyLocalKey,
  sessionStillOwned,
} from "@/services/accountDeletion/sessionLocalReadiness";
import { sessionPublicationLive } from "@/services/accountDeletion/sessionPublication";
import { createAuthChallengePersistence } from "@/services/auth/authChallengePersistence";
import {
  __resetAuthSessionFenceForTests,
  authRetirementOwns,
  beginSessionCommit,
  clearPersistedProfileIfOwned,
  currentAuthMutationGeneration,
  currentSessionCommitEpoch,
  noteNativeAuthIdentity,
} from "@/services/auth/authSessionFence";
import { REACTIVATION_VERIFY_BOUND_MS } from "@/services/auth/reactivationEmailVerification";
import { ANDROID_PHONE_VERIFICATION_TIMEOUT_SECONDS } from "@/services/auth/phoneVerificationPlan";
import { issueProfileDocumentIfOwned, profileWriteStillOwned } from "@/services/auth/profileWriteOwnership";
import { signOutNativePhoneAuth } from "@/services/auth/nativePhoneAuth";
import {
  __setSessionStorageForTests,
  SESSION_KEY,
  sessionStore,
  type AuthSession,
} from "@/services/sessionPersistence";

const PHONE_A = "+919800000001";
const PHONE_B = "+919800000002";
const root = process.cwd();

function read(path: string): string {
  return readFileSync(resolve(root, path), "utf8");
}

async function main(): Promise<void> {
  assert.equal(PHONE_AUTH_USER_BOUND_MS, 45_000);
  assert.equal(PHONE_NATIVE_SEND_BOUND_MS, 20_000);
  assert.equal(PHONE_NATIVE_CONFIRM_BOUND_MS, 20_000);
  assert.equal(PHONE_ACCOUNT_BOUND_MS, 20_000);
  assert.equal(PHONE_SESSION_BOUND_MS, 20_000);
  assert.equal(PHONE_CLEANUP_BOUND_MS, 3_000);
  assert.equal(REACTIVATION_VERIFY_BOUND_MS, 20_000);
  assert.equal(ANDROID_PHONE_VERIFICATION_TIMEOUT_SECONDS, 60);
  assert.equal(typeof commitAfterLocalReadiness, "function");
  assert.equal(typeof requireReadyLocalKey, "function");
  assert.equal(typeof openRetainedSession, "function");
  assert.equal(typeof sessionPublicationLive, "function");
  assert.equal(typeof issueProfileDocumentIfOwned, "function");
  assert.equal(typeof phoneProfileOwnershipHeld, "function");

  const closed = openRestoredPhoneChallenge({
    action: "resume",
    restored: false,
    expiresAt: 1_700_000_060_000,
    resendAvailableAt: 1_700_000_030_000,
    now: 1_700_000_000_000,
  });
  assert.equal(closed.openOtp, false);
  assert.equal(closed.expiresAt, 1_700_000_060_000);

  const rows = new Map<string, string>();
  const challenges = createAuthChallengePersistence({
    read: async () => rows.get("challenge") ?? null,
    write: async (value) => {
      rows.set("challenge", value);
    },
    remove: async () => {
      rows.delete("challenge");
    },
  });
  await challenges.save({ phoneE164: PHONE_B, verificationId: "challenge-newer" }, () => true);
  await challenges.clear({ phoneE164: PHONE_A, verificationId: "challenge-older" }, () => true);
  assert.equal(JSON.parse(rows.get("challenge") ?? "{}").verificationId, "challenge-newer");
  await challenges.clear({ phoneE164: PHONE_B, verificationId: "challenge-newer" }, () => false);
  assert.equal(JSON.parse(rows.get("challenge") ?? "{}").verificationId, "challenge-newer");

  __resetAuthSessionFenceForTests();
  noteNativeAuthIdentity("uid-owner");
  const generation = currentAuthMutationGeneration();
  const signOutEpoch = beginSessionCommit();
  noteNativeAuthIdentity("uid-owner");
  const replacementEpoch = beginSessionCommit();
  assert.equal(currentAuthMutationGeneration(), generation);
  assert.notEqual(replacementEpoch, signOutEpoch);
  assert.equal(
    sessionStillOwned(
      { uid: "uid-owner", generation, epoch: signOutEpoch },
      sessionPublicationLive({
        platform: "android",
        nativeUid: "uid-owner",
        jsUid: null,
        generation,
        epoch: currentSessionCommitEpoch(),
      })
    ),
    false
  );
  assert.equal(
    phoneProfileOwnershipHeld(
      { uid: "uid-owner", generation },
      { uid: "uid-owner", generation },
      "uid-owner"
    ),
    true
  );

  let removed = false;
  const profileCleared = await clearPersistedProfileIfOwned(generation, {
    prepare: async () => {
      if (currentSessionCommitEpoch() !== signOutEpoch || !authRetirementOwns(generation)) return;
      removed = true;
    },
    removePersistedProfile: async () => {
      if (currentSessionCommitEpoch() !== signOutEpoch || !authRetirementOwns(generation)) return;
      removed = true;
    },
  });
  assert.equal(profileCleared, true);
  assert.equal(removed, false);

  const beforeSwitch = currentAuthMutationGeneration();
  noteNativeAuthIdentity("uid-other");
  assert.notEqual(currentAuthMutationGeneration(), beforeSwitch);
  assert.equal(
    profileWriteStillOwned(
      { uid: "uid-owner", generation: beforeSwitch },
      { uid: "uid-other", generation: currentAuthMutationGeneration() }
    ),
    false
  );

  const memory = new Map<string, string>();
  __setSessionStorageForTests({
    getItem: async (key) => memory.get(key) ?? null,
    setItem: async (key, value) => {
      memory.set(key, value);
    },
    deleteItem: async (key) => {
      memory.delete(key);
    },
  });
  try {
    const newer = {
      user: { uid: "uid-owner", marker: "newer" },
      signedInAt: 2,
      lastActiveAt: 2,
    } as unknown as AuthSession;
    const older = {
      user: { uid: "uid-owner", marker: "older" },
      signedInAt: 1,
      lastActiveAt: 1,
    } as unknown as AuthSession;
    const hold: { release: () => void } = { release: () => undefined };
    const staleHeld = new Promise<void>((resolveHold) => {
      hold.release = resolveHold;
    });
    let writes = 0;
    __setSessionStorageForTests({
      getItem: async (key) => memory.get(key) ?? null,
      setItem: async (key, value) => {
        writes += 1;
        memory.set(key, value);
        if (writes === 1) await staleHeld;
      },
      deleteItem: async (key) => {
        memory.delete(key);
      },
    });
    let staleCurrent = true;
    const staleSave = sessionStore.saveIfCurrent(older, () => staleCurrent);
    for (let i = 0; i < 20 && writes === 0; i += 1) await Promise.resolve();
    assert.equal(writes, 1);
    staleCurrent = false;
    const freshSave = sessionStore.saveIfCurrent(newer, () => true);
    hold.release();
    assert.equal(await staleSave, false);
    assert.equal(await freshSave, true);
    assert.equal(JSON.parse(memory.get(SESSION_KEY) ?? "{}").user.marker, "newer");
  } finally {
    __setSessionStorageForTests(null);
  }

  assert.equal(await signOutNativePhoneAuth(() => false), false);

  const gate = read("src/auth-v2/AuthFlowGate.tsx");
  const resetBody = gate.slice(gate.indexOf("const resetToPhone"), gate.indexOf("const emailVerifiedChip"));
  assert.ok(resetBody.indexOf('setStep("phone")') < resetBody.indexOf("escapePhoneChallenge"));
  assert.match(resetBody, /PHONE_CLEANUP_BOUND_MS/);
  assert.match(resetBody, /clearAuthWrapperChallenge\(oldChallenge, isResetCurrent\)/);
  assert.equal(resetBody.includes("clearAuthWrapperProgress"), false);
  assert.equal(resetBody.includes("10 * 60_000"), false);
  const back = gate.slice(gate.indexOf('action === "phone_unverified"'), gate.indexOf("email_from_email_otp"));
  assert.match(back, /resetToPhone\(\)/);
  assert.equal(back.includes("await resetToPhone"), false);
  const unknown = gate.slice(
    gate.indexOf('view.settlement === "unknown"'),
    gate.indexOf('view.settlement === "session_changed"')
  );
  assert.match(unknown, /autoVerifyHandledRef\.current = ownedChallenge\.verificationId/);
  assert.match(unknown, /beginSessionCommit\(\)/);
  assert.match(unknown, /\.retire\(\)/);
  assert.match(unknown, /resultUnknown/);
  const retry = gate.slice(gate.indexOf("const handleRetryAccountSetup"), gate.indexOf("const handleResend"));
  assert.equal(retry.includes("startOtp("), false);
  assert.equal(retry.includes("sendOtpForWrapper("), false);
  assert.match(retry, /retryAuthenticatedAccountSetup\(/);
  assert.equal(gate.includes("onVerifyStart"), false);
  assert.equal(gate.includes("profileNeedsAgeGate"), false);
  assert.equal(gate.includes("age-declaration"), false);
  assert.match(read("src/auth-v2/phoneProfileContinuation.ts"), /export async function retryAuthenticatedAccountSetup/);
  assert.match(read("src/auth-v2/phoneProfileContinuation.ts"), /export function phoneProfileOwnershipHeld/);
  assert.match(read("src/services/accountDeletion/sessionLocalReadiness.ts"), /export function sessionStillOwned/);
  assert.match(read("src/services/accountDeletion/sessionLocalReadiness.ts"), /export async function commitAfterLocalReadiness/);
  assert.match(read("src/services/accountDeletion/sessionLocalReadiness.ts"), /export function requireReadyLocalKey/);
  assert.match(read("src/services/accountDeletion/sessionLocalReadiness.ts"), /export async function openRetainedSession/);
  assert.match(read("src/services/accountDeletion/sessionPublication.ts"), /export function sessionPublicationLive/);
  assert.match(read("src/services/auth/profileWriteOwnership.ts"), /export function profileWriteStillOwned/);
  assert.match(read("src/services/auth/profileWriteOwnership.ts"), /export async function issueProfileDocumentIfOwned/);
  const authProvider = read("src/state/auth.tsx");
  assert.match(authProvider, /currentSessionCommitEpoch\(\) !== signOutEpoch/);
  assert.match(authProvider, /clearSessionForRetirement\(ownedGeneration\)/);
  assert.match(authProvider, /sessionStillOwned\(claim, readPublicationLive\(\)\)/);
  const firebase = read("src/services/auth/firebase.ts");
  assert.match(firebase, /currentSessionCommitEpoch\(\)/);
  assert.match(firebase, /issueProfileDocumentIfOwned/);
  const native = read("src/services/auth/nativePhoneAuth.ts");
  assert.match(native, /if \(!isCurrent\(\)\) return false;/);
  assert.match(native, /sendInFlight = true;/);

  console.log("phoneAttemptOwnership.test.ts: ok");
}

main();
