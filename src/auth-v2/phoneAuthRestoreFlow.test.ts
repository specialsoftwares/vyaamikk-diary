/**
 * Connected phone restore path.
 * Uses the production resume decision, challenge machine, resend decision,
 * and native-session rehydrate. Storage and accounts are synthetic.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  adoptRestoredPhoneChallenge,
  createPhoneOtpChallengeMachine,
  isCurrentPhoneChallenge,
  retirePhoneChallenge,
} from "@/auth/phoneOtpChallengeMachine";
import { resumeSignedOutPhoneChallenge } from "@/auth-v2/signedOutChallengeResume";
import { createAuthChallengePersistence, type AuthChallengeIdentity } from "@/services/auth/authChallengePersistence";
import {
  __clearNativePhoneSessions,
  __seedPendingSessionForTests,
  restorePendingPhoneSessionForResume,
} from "@/services/auth/nativePhoneAuth";
import {
  clearNativePhoneAuthSession,
  loadNativePhoneAuthSession,
  saveNativePhoneAuthSession,
} from "@/services/auth/nativePhoneAuthSession";
import {
  emptyCodeConfirmAllowed,
  evaluatePostSendAutoVerification,
} from "@/services/auth/phoneChallengeAuthInvariant";
import {
  presentedPhoneResend,
  sharedPhoneResendDeadline,
} from "@/services/auth/phoneVerificationPlan";
import type { PhoneE164 } from "@/domain/types";

const PHONE_A = "+919800000001";
const PHONE_B = "+919800000002";
const ID_A = "challenge-a";
const ID_B = "challenge-b";
const root = process.cwd();

function memoryWrapper() {
  let raw: string | null = null;
  const port = createAuthChallengePersistence({
    read: async () => raw,
    write: async (value) => {
      raw = value;
    },
    remove: async () => {
      raw = null;
    },
  });
  return {
    port,
    async read(): Promise<(AuthChallengeIdentity & { devCodeHint: string | null }) | null> {
      if (!raw) return null;
      const parsed = JSON.parse(raw) as Partial<AuthChallengeIdentity & { devCodeHint?: string | null }>;
      if (typeof parsed.phoneE164 !== "string" || typeof parsed.verificationId !== "string") return null;
      return {
        phoneE164: parsed.phoneE164,
        verificationId: parsed.verificationId,
        devCodeHint: typeof parsed.devCodeHint === "string" ? parsed.devCodeHint : null,
      };
    },
  };
}

async function seedNative(input: { phone: string; verificationId: string; expiresAt: number; attemptId: string }) {
  await saveNativePhoneAuthSession({
    firebaseVerificationId: input.verificationId,
    phoneE164: input.phone as PhoneE164,
    expiresAt: input.expiresAt,
    attemptId: input.attemptId,
  });
}

async function run() {
  const now = Date.now();
  const until = now + 19_000;
  __clearNativePhoneSessions();
  await clearNativePhoneAuthSession();

  const store = memoryWrapper();
  await store.port.save({ phoneE164: PHONE_A, verificationId: ID_A });
  await seedNative({
    phone: PHONE_A,
    verificationId: ID_A,
    expiresAt: now + 60_000,
    attemptId: "synthetic-attempt",
  });
  const resumed = await resumeSignedOutPhoneChallenge({
    loadWrapper: () => store.read(),
    loadDigits: async () => ({
      phoneE164: PHONE_A,
      verificationId: ID_A,
      digits: "",
      expiresAt: now + 60_000,
      resendAvailableAt: until,
      savedAt: now,
    }),
    clearWrapper: (expected, isCurrent) => store.port.clear(expected, isCurrent),
  });
  assert.equal(resumed.action, "resume");
  if (resumed.action !== "resume") return;
  const idle = createPhoneOtpChallengeMachine();
  assert.equal(isCurrentPhoneChallenge(idle, idle.generation), false);
  assert.equal(idle.verificationId === resumed.verificationId, false);
  const owned = adoptRestoredPhoneChallenge(idle, resumed.verificationId);
  assert.equal(isCurrentPhoneChallenge(owned, owned.generation), true);
  assert.equal(owned.verificationId, resumed.verificationId);
  const deadline = sharedPhoneResendDeadline(resumed.resendAvailableAt, now);
  assert.equal(deadline, until);
  const during = presentedPhoneResend({ resendAvailableAt: deadline, now });
  assert.equal(during.invoke, false);
  assert.equal(during.forceResend, false);
  assert.equal(during.showCountdown, true);
  assert.equal(during.remainingSeconds, 19);
  assert.equal(during.resendAvailableAt, until);
  const afterExpiry = presentedPhoneResend({ resendAvailableAt: deadline, now: until });
  assert.equal(afterExpiry.invoke, true);
  assert.equal(afterExpiry.forceResend, true);
  assert.equal(afterExpiry.resendAvailableAt, until);

  const missing = presentedPhoneResend({ resendAvailableAt: null, now });
  assert.equal(missing.invoke, false);
  assert.equal(missing.resendAvailableAt, null);
  const materialized = sharedPhoneResendDeadline(null, now);
  const materializedTap = presentedPhoneResend({ resendAvailableAt: materialized, now });
  assert.equal(materializedTap.invoke, false);
  assert.equal(materializedTap.resendAvailableAt, materialized);
  const materializedAfter = presentedPhoneResend({ resendAvailableAt: materialized, now: materialized });
  assert.equal(materializedAfter.invoke, true);
  assert.equal(materializedAfter.forceResend, true);

  assert.equal(await restorePendingPhoneSessionForResume(ID_A, PHONE_A), true);
  const persisted = await loadNativePhoneAuthSession();
  assert.equal(persisted?.firebaseVerificationId, ID_A);
  const marker = evaluatePostSendAutoVerification({
    challenge: {
      attemptId: persisted?.attemptId ?? "",
      verificationId: ID_A,
      phoneE164: PHONE_A,
      startedAtMs: persisted?.savedAt ?? now,
    },
    preSendUid: null,
    currentUid: "uid-synthetic",
    currentPhoneE164: PHONE_A,
    observedAtMs: (persisted?.savedAt ?? now) + 1_000,
  });
  assert.ok(marker);
  assert.equal(
    emptyCodeConfirmAllowed({
      challengeVerificationId: ID_A,
      challengePhoneE164: PHONE_A,
      challengeAttemptId: persisted?.attemptId ?? "",
      marker,
      currentUid: "uid-synthetic",
      currentPhoneE164: PHONE_A,
    }),
    true
  );
  assert.equal(
    evaluatePostSendAutoVerification({
      challenge: {
        attemptId: persisted?.attemptId ?? "",
        verificationId: ID_A,
        phoneE164: PHONE_A,
        startedAtMs: persisted?.savedAt ?? now,
      },
      preSendUid: null,
      currentUid: "uid-synthetic",
      currentPhoneE164: PHONE_B,
      observedAtMs: now + 1_000,
    }),
    null
  );

  __clearNativePhoneSessions();
  __seedPendingSessionForTests({
    confirmation: null,
    firebaseVerificationId: "challenge-newer",
    phoneE164: PHONE_B as PhoneE164,
    expiresAt: now + 120_000,
    attemptId: "newer-attempt",
    startedAtMs: now,
    preSendUid: null,
    autoVerify: null,
  });
  assert.equal(await restorePendingPhoneSessionForResume(ID_A, PHONE_A), false);
  assert.equal((await loadNativePhoneAuthSession())?.firebaseVerificationId, ID_A);
  assert.equal(await restorePendingPhoneSessionForResume("challenge-newer", PHONE_B), true);

  __clearNativePhoneSessions();
  await clearNativePhoneAuthSession();
  const expiredStore = memoryWrapper();
  await expiredStore.port.save({ phoneE164: PHONE_A, verificationId: ID_A });
  await seedNative({
    phone: PHONE_A,
    verificationId: ID_A,
    expiresAt: now - 1_000,
    attemptId: "expired-attempt",
  });
  const expired = await resumeSignedOutPhoneChallenge({
    loadWrapper: () => expiredStore.read(),
    loadDigits: async () => ({
      phoneE164: PHONE_A,
      verificationId: ID_A,
      digits: "",
      expiresAt: now + 60_000,
      resendAvailableAt: until,
      savedAt: now,
    }),
    clearWrapper: (expected, isCurrent) => expiredStore.port.clear(expected, isCurrent),
  });
  assert.equal(expired.action, "phone");
  assert.equal(await expiredStore.read(), null);
  assert.equal(await restorePendingPhoneSessionForResume(ID_A, PHONE_A), false);

  const mismatched = await resumeSignedOutPhoneChallenge({
    loadWrapper: async () => ({ phoneE164: PHONE_A, verificationId: ID_A, devCodeHint: null }),
    loadNative: async () => ({
      firebaseVerificationId: ID_B,
      phoneE164: PHONE_A as PhoneE164,
      expiresAt: now + 60_000,
      attemptId: "other",
      savedAt: now,
    }),
    loadDigits: async () => null,
    clearWrapper: async () => undefined,
  });
  assert.equal(mismatched.action, "phone");

  const retired = retirePhoneChallenge(owned);
  assert.equal(isCurrentPhoneChallenge(retired, owned.generation), false);
  assert.equal(retired.verificationId, null);

  const gate = readFileSync(resolve(root, "src/auth-v2/AuthFlowGate.tsx"), "utf8");
  const launchStart = gate.indexOf("resumeSignedOutPhoneChallenge(");
  const launch = gate.slice(launchStart, gate.indexOf("if (!cancelled) setHydrated(true);", launchStart));
  assert.ok(launch.indexOf("restorePendingPhoneSessionForResume") < launch.indexOf("openRestoredPhoneChallenge"));
  assert.ok(launch.indexOf("openRestoredPhoneChallenge") < launch.indexOf("adoptRestoredPhoneChallenge"));
  assert.ok(launch.indexOf("opened.openOtp") < launch.indexOf('setStep("otp")'));
  assert.ok(launch.indexOf("sharedPhoneResendDeadline") < launch.indexOf('setStep("otp")'));
  assert.equal(launch.includes("startOtp("), false);
  assert.equal(launch.includes("sendOtpForWrapper("), false);
  assert.match(gate, /authV2\.otp\.restoredCode/);
  assert.match(gate, /authV2\.otp\.resendWait/);
  const resend = gate.slice(gate.indexOf("const handleResend"), gate.indexOf("const handleEmailContinue"));
  assert.ok(resend.indexOf("presentedPhoneResend") < resend.indexOf("beginPhoneOtpSend"));
  assert.match(resend, /forceResend: true/);
  const screen = readFileSync(resolve(root, "src/auth-v2/screens/OtpVerificationScreen.tsx"), "utf8");
  assert.match(screen, /presentedPhoneResend/);
  assert.match(screen, /authV2\.otp\.resendWait/);
  assert.equal(screen.includes("codeSentTo"), true);

  console.log("phoneAuthRestoreFlow.test.ts: ok");
}

void run();
