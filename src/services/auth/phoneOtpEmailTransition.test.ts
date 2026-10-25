/**
 * Ordering evidence for the phone-OTP to email transition.
 * Deferred promises prove sequence. They are not device timings.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { PendingLegalConsent } from "@/domain/legalConsent";
import type { UserProfile } from "@/domain/types";
import {
  mergeLegalConsentGrants,
  pendingConsentChoicesEqual,
} from "@/services/consent/pendingConsentReconcile";
import { persistDeferredPhoneConsent } from "@/services/consent/deferredConsentPersist";

const LEGAL_CONSENT_VERSION = "1.0.0";
import { userProfileWriteNeedsSeal } from "@/services/privacy/businessCloudSeal";
import { __resetAuthPerfForTests, perfSpans } from "./authFlowPerf";
import { afterPhoneIdentityResolved } from "./phoneOtpEmailTransition";
import { createSharedBridgeRunner } from "./sharedAuthBridge";

const root = join(__dirname, "../..");

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  let reject: (error: unknown) => void = () => undefined;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const profile = {
  uid: "uid-a",
  phoneE164: "+919999990001",
  legalConsents: [],
} as unknown as UserProfile;

function pending(acceptedAt: number, userId?: string): PendingLegalConsent {
  return {
    phoneE164: "+919999990001",
    record: {
      consentVersion: LEGAL_CONSENT_VERSION,
      termsVersion: "1.0.0",
      privacyVersion: "1.0.0",
      effectiveDate: "2026-07-27",
      acceptedAt,
      userId,
      phoneE164: "+919999990001",
      appVersion: "1.0.0",
      platform: "android",
      sourceScreen: "auth_v2_phone_confirm",
    },
  };
}

async function main() {
  __resetAuthPerfForTests();
  const bridge = deferred<boolean>();
  let bridgeStarted = false;
  const emailShown = { value: false };
  const account = afterPhoneIdentityResolved({
    resolveAccount: async () => profile,
    beginBridge: () => {
      bridgeStarted = true;
      return bridge.promise;
    },
  });
  const resolved = await account;
  assert.equal(resolved, profile);
  assert.equal(bridgeStarted, true);
  assert.equal(emailShown.value, false);
  const ordering = perfSpans().filter((span) => span.evidence === "ordering");
  assert.equal(ordering.length, 1);
  assert.equal(ordering[0]?.durationMs, 0);
  assert.equal(bridge.promise, bridge.promise);
  let showedWhilePending = false;
  const consent = deferred<"written">();
  const release = (async () => {
    showedWhilePending = true;
    emailShown.value = true;
    return "email" as const;
  })();
  void consent.promise;
  assert.equal(await release, "email");
  assert.equal(showedWhilePending, true);
  let consentSettled = false;
  void consent.promise.then(() => {
    consentSettled = true;
  });
  assert.equal(emailShown.value, true);
  assert.equal(consentSettled, false);
  consent.resolve("written");
  bridge.resolve(true);

  let bridgeCalls = 0;
  await assert.rejects(
    afterPhoneIdentityResolved({
      resolveAccount: async () => {
        throw new Error("identity_failed");
      },
      beginBridge: () => {
        bridgeCalls += 1;
        return Promise.resolve(true);
      },
    })
  );
  assert.equal(bridgeCalls, 0);

  const runner = createSharedBridgeRunner();
  const gate = deferred<boolean>();
  let runs = 0;
  const first = runner({ uid: "uid-a", generation: 1 }, () => {
    runs += 1;
    return gate.promise;
  });
  const second = runner({ uid: "uid-a", generation: 1 }, () => {
    runs += 1;
    return Promise.resolve(true);
  });
  assert.equal(first, second);
  await Promise.resolve();
  assert.equal(runs, 1);
  gate.resolve(false);
  assert.equal(await first, false);
  assert.equal(await second, false);

  const again = deferred<boolean>();
  let retryRuns = 0;
  const retry = runner({ uid: "uid-a", generation: 1 }, () => {
    retryRuns += 1;
    return again.promise;
  });
  again.resolve(true);
  assert.equal(await retry, true);
  assert.equal(retryRuns, 1);

  const switched = deferred<boolean>();
  let switchedRuns = 0;
  const switchedPromise = runner({ uid: "uid-b", generation: 2 }, () => {
    switchedRuns += 1;
    return switched.promise;
  });
  switched.resolve(true);
  assert.equal(await switchedPromise, true);
  assert.equal(switchedRuns, 1);

  const stored = pending(10);
  let cleared: PendingLegalConsent | null = null;
  let writes = 0;
  const written = await persistDeferredPhoneConsent({
    profile,
    generationAtStart: 4,
    currentGeneration: () => 4,
    sessionUid: () => "uid-a",
    loadPending: async () => stored,
    rebuildRecord: stored.record,
    updateProfile: async () => {
      writes += 1;
    },
    clearIfUnchanged: async (snapshot) => {
      cleared = snapshot;
      return true;
    },
  });
  assert.equal(written, "written");
  assert.equal(writes, 1);
  assert.equal(cleared, stored);

  let failedCleared = false;
  const failed = await persistDeferredPhoneConsent({
    profile,
    generationAtStart: 4,
    currentGeneration: () => 4,
    sessionUid: () => "uid-a",
    loadPending: async () => stored,
    rebuildRecord: stored.record,
    updateProfile: async () => {
      throw new Error("bridge_failed");
    },
    clearIfUnchanged: async () => {
      failedCleared = true;
      return true;
    },
  });
  assert.equal(failed, "failed");
  assert.equal(failedCleared, false);

  const stale = await persistDeferredPhoneConsent({
    profile,
    generationAtStart: 4,
    currentGeneration: () => 5,
    sessionUid: () => "uid-b",
    loadPending: async () => stored,
    rebuildRecord: stored.record,
    updateProfile: async () => {
      throw new Error("should_not_write");
    },
    clearIfUnchanged: async () => {
      throw new Error("should_not_clear");
    },
  });
  assert.equal(stale, "skipped");

  const otherAccount = await persistDeferredPhoneConsent({
    profile,
    generationAtStart: 4,
    currentGeneration: () => 4,
    sessionUid: () => "uid-a",
    loadPending: async () => pending(10, "uid-b"),
    rebuildRecord: pending(10, "uid-b").record,
    updateProfile: async () => {
      throw new Error("should_not_write");
    },
    clearIfUnchanged: async () => {
      throw new Error("should_not_clear");
    },
  });
  assert.equal(otherAccount, "skipped");

  const newerProfile = {
    ...profile,
    legalConsents: [{ ...stored.record, acceptedAt: 50 }],
  } as unknown as UserProfile;
  const olderGrant = await persistDeferredPhoneConsent({
    profile: newerProfile,
    generationAtStart: 4,
    currentGeneration: () => 4,
    sessionUid: () => "uid-a",
    loadPending: async () => stored,
    rebuildRecord: stored.record,
    updateProfile: async () => {
      throw new Error("should_not_write");
    },
    clearIfUnchanged: async () => {
      throw new Error("should_not_clear");
    },
  });
  assert.equal(olderGrant, "skipped");

  const newer = pending(30);
  let clearedNewer = false;
  const kept = await persistDeferredPhoneConsent({
    profile,
    generationAtStart: 4,
    currentGeneration: () => 4,
    sessionUid: () => "uid-a",
    loadPending: async () => stored,
    rebuildRecord: stored.record,
    updateProfile: async () => undefined,
    clearIfUnchanged: async (snapshot) => {
      clearedNewer = snapshot.record.acceptedAt === newer.record.acceptedAt;
      return snapshot.record.acceptedAt === stored.record.acceptedAt;
    },
  });
  assert.equal(kept, "written");
  assert.equal(clearedNewer, false);
  assert.equal(pendingConsentChoicesEqual(stored, newer), false);

  const merged = mergeLegalConsentGrants(
    [{ ...stored.record, acceptedAt: 40 }],
    [{ ...stored.record, acceptedAt: 10 }]
  );
  assert.equal(merged[0]?.acceptedAt, 40);

  assert.equal(
    userProfileWriteNeedsSeal(
      { displayName: "A", legalConsents: [] },
      { displayName: "A", legalConsents: [{ acceptedAt: 1 }] }
    ),
    false
  );
  assert.equal(
    userProfileWriteNeedsSeal({ displayName: "A" }, { displayName: "B" }),
    true
  );
  assert.equal(
    userProfileWriteNeedsSeal(
      { displayName: "A", gstin: null },
      { displayName: "B", gstin: "hidden", legalConsents: [{ acceptedAt: 2 }] }
    ),
    true
  );

  const gateSrc = readFileSync(join(root, "auth-v2/AuthFlowGate.tsx"), "utf8");
  const start = gateSrc.indexOf("const continueAfterPhoneProfile");
  const fnEnd = gateSrc.indexOf("const handleVerifyOtp", start);
  const window = gateSrc.slice(start, fnEnd);
  assert.equal(window.includes("await updateProfile"), false);
  assert.ok(window.indexOf("persistDeferredPhoneConsent") < window.indexOf('setStep("email")'));
  assert.equal(/await persistDeferredPhoneConsent\(/.test(window), false);

  const firebase = readFileSync(join(root, "services/auth/firebase.ts"), "utf8");
  const confirmStart = firebase.indexOf("async confirmOtp");
  const confirmEnd = firebase.indexOf("async signOut", confirmStart);
  const confirm = firebase.slice(confirmStart, confirmEnd);
  assert.match(confirm, /afterPhoneIdentityResolved/);
  assert.match(confirm, /beginSharedJsAuthSession/);
  assert.equal(confirm.includes("requireJsAuthSessionForFirestore"), false);
  const updateStart = firebase.indexOf("async updateProfile");
  const updateEnd = firebase.indexOf("async startMobileChange", updateStart);
  const update = firebase.slice(updateStart, updateEnd);
  assert.match(update, /userProfileWriteNeedsSeal/);
  assert.match(update, /if \(needsSeal\)/);
  assert.match(update, /protectBusinessCloud/);

  const email = readFileSync(join(root, "services/auth/emailVerificationService.ts"), "utf8");
  const bind = readFileSync(join(root, "services/auth/bindBusinessEmail.ts"), "utf8");
  assert.equal(email.includes("ensureJsAuthSession"), false);
  assert.equal(email.includes("requireJsAuthSessionForFirestore"), false);
  assert.equal(bind.includes("ensureJsAuthSession"), false);
  assert.match(email, /callStartEmailVerification/);

  const bridgeSrc = readFileSync(join(root, "services/auth/jsAuthBridge.ts"), "utf8");
  assert.match(bridgeSrc, /enqueueAuthMutation/);
  assert.match(bridgeSrc, /beginSharedJsAuthSession/);
  const requireStart = bridgeSrc.indexOf("export async function requireJsAuthSessionForFirestore");
  const requireSlice = bridgeSrc.slice(requireStart, requireStart + 900);
  assert.match(requireSlice, /beginSharedJsAuthSession/);
  assert.match(requireSlice, /JS_AUTH_BRIDGE_FAILED/);

  const mint = readFileSync(join(root, "../functions/src/identity/mintClientAuthToken.ts"), "utf8");
  assert.equal(mint.includes("verifyIdToken"), false);
  assert.match(mint, /assertAdmittedCallableUser\(request, restoreReads\)/);
  assert.match(mint, /restoreAdmissionForUid\(decision\.uid, undefined, restoreReads\)/);
  const admit = readFileSync(join(root, "../functions/src/identity/admitCallableUser.ts"), "utf8");
  assert.match(admit, /verifyIdToken\(bearer, true\)/);

  console.log("phoneOtpEmailTransition.test.ts: ok");
}

void main();
