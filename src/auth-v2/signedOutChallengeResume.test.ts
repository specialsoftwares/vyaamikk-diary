import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createAuthChallengePersistence, type AuthChallengeIdentity } from "@/services/auth/authChallengePersistence";
import {
  clearNativePhoneAuthSession,
  loadNativePhoneAuthSession,
  saveNativePhoneAuthSession,
} from "@/services/auth/nativePhoneAuthSession";
import { planPhoneVerification } from "@/services/auth/phoneVerificationPlan";
import { resumeSignedOutPhoneChallenge } from "@/auth-v2/signedOutChallengeResume";

const PHONE_A = "+919800000001";
const PHONE_A_SPACED = "+91 98000 00001";
const PHONE_B = "+919800000002";
const ID_A = "challenge-a";
const ID_B = "challenge-b";
const root = process.cwd();

function memoryPersistence() {
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

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function seedNative(input: {
  phoneE164: string;
  verificationId: string;
  expiresAt: number;
}) {
  await saveNativePhoneAuthSession({
    firebaseVerificationId: input.verificationId,
    phoneE164: input.phoneE164 as "+919800000001",
    expiresAt: input.expiresAt,
    attemptId: "synthetic-attempt",
  });
}

async function launch(input: {
  wrapper?: AuthChallengeIdentity | null;
  digits?: {
    phoneE164: string;
    verificationId: string;
    resendAvailableAt: number;
  } | null;
  holdNative?: boolean;
  prepareNative?: () => Promise<void>;
}) {
  await clearNativePhoneAuthSession();
  if (input.prepareNative) await input.prepareNative();
  const store = memoryPersistence();
  if (input.wrapper) await store.port.save(input.wrapper);
  const nativeHold = deferred<Awaited<ReturnType<typeof loadNativePhoneAuthSession>>>();
  let current = true;
  const resultPromise = resumeSignedOutPhoneChallenge({
    isCurrent: () => current,
    loadWrapper: async () => store.read(),
    loadNative: input.holdNative ? () => nativeHold.promise : undefined,
    loadDigits: async () =>
      input.digits
        ? {
            phoneE164: input.digits.phoneE164,
            verificationId: input.digits.verificationId,
            digits: "",
            expiresAt: Date.now() + 60_000,
            resendAvailableAt: input.digits.resendAvailableAt,
            savedAt: Date.now(),
          }
        : null,
    clearWrapper: (expected, isCurrent) => store.port.clear(expected, isCurrent),
  });
  return { store, resultPromise, nativeHold, setCurrent: (value: boolean) => { current = value; } };
}

async function run() {
  const now = Date.now();
  const resume = await launch({
    wrapper: { phoneE164: PHONE_A_SPACED, verificationId: ID_A },
    digits: { phoneE164: PHONE_A, verificationId: ID_A, resendAvailableAt: now + 30_000 },
    prepareNative: () => seedNative({ phoneE164: PHONE_A, verificationId: ID_A, expiresAt: now + 60_000 }),
  });
  const resumed = await resume.resultPromise;
  assert.equal(resumed.action, "resume");
  if (resumed.action === "resume") {
    assert.equal(resumed.resendAvailableAt, now + 30_000);
    assert.equal(resumed.phoneE164, PHONE_A_SPACED);
  }
  assert.deepEqual(await resume.store.read(), {
    phoneE164: PHONE_A_SPACED,
    verificationId: ID_A,
    devCodeHint: null,
  });
  assert.equal((await loadNativePhoneAuthSession())?.firebaseVerificationId, ID_A);

  for (const native of ["expired", "missing"] as const) {
    const opened = await launch({
      wrapper: { phoneE164: PHONE_A, verificationId: ID_A },
      digits: { phoneE164: PHONE_A, verificationId: ID_A, resendAvailableAt: now + 30_000 },
      prepareNative:
        native === "expired"
          ? () => seedNative({ phoneE164: PHONE_A, verificationId: ID_A, expiresAt: now - 1_000 })
          : undefined,
    });
    const result = await opened.resultPromise;
    assert.equal(result.action, "phone", native);
    assert.equal(await opened.store.read(), null, native);
    assert.equal(await loadNativePhoneAuthSession(), null, native);
  }

  const wrongPhone = await launch({
    wrapper: { phoneE164: PHONE_A, verificationId: ID_A },
    prepareNative: () => seedNative({ phoneE164: PHONE_B, verificationId: ID_A, expiresAt: now + 60_000 }),
  });
  assert.equal((await wrongPhone.resultPromise).action, "phone");
  assert.equal(await wrongPhone.store.read(), null);
  assert.equal((await loadNativePhoneAuthSession())?.phoneE164, PHONE_B);

  const wrongId = await launch({
    wrapper: { phoneE164: PHONE_A, verificationId: ID_A },
    prepareNative: () => seedNative({ phoneE164: PHONE_A, verificationId: ID_B, expiresAt: now + 60_000 }),
  });
  assert.equal((await wrongId.resultPromise).action, "phone");
  assert.equal(await wrongId.store.read(), null);
  assert.equal((await loadNativePhoneAuthSession())?.firebaseVerificationId, ID_B);

  const absent = await launch({});
  assert.equal((await absent.resultPromise).action, "phone");
  assert.equal(await absent.store.read(), null);

  const mismatchedDigits = await launch({
    wrapper: { phoneE164: PHONE_A, verificationId: ID_A },
    digits: { phoneE164: PHONE_B, verificationId: ID_A, resendAvailableAt: now + 30_000 },
    prepareNative: () => seedNative({ phoneE164: PHONE_A, verificationId: ID_A, expiresAt: now + 60_000 }),
  });
  const mismatched = await mismatchedDigits.resultPromise;
  assert.equal(mismatched.action, "resume");
  if (mismatched.action === "resume") assert.equal(mismatched.resendAvailableAt, null);

  const raced = await launch({
    wrapper: { phoneE164: PHONE_A, verificationId: ID_A },
    holdNative: true,
  });
  await new Promise((done) => setImmediate(done));
  await raced.store.port.save({ phoneE164: PHONE_A, verificationId: "challenge-newer" });
  raced.nativeHold.resolve(null);
  assert.equal((await raced.resultPromise).action, "stale");
  assert.equal((await raced.store.read())?.verificationId, "challenge-newer");

  const retired = await launch({
    wrapper: { phoneE164: PHONE_A, verificationId: ID_A },
    holdNative: true,
  });
  await new Promise((done) => setImmediate(done));
  retired.setCurrent(false);
  retired.nativeHold.resolve(null);
  assert.equal((await retired.resultPromise).action, "stale");
  assert.deepEqual(await retired.store.read(), {
    phoneE164: PHONE_A,
    verificationId: ID_A,
    devCodeHint: null,
  });

  const fresh = planPhoneVerification({ intent: "fresh", now, resendAvailableAt: now + 30_000 });
  assert.deepEqual(fresh, { action: "send", forceResend: false });
  const eligible = planPhoneVerification({
    intent: "explicit_resend",
    now: now + 30_000,
    resendAvailableAt: now + 30_000,
  });
  assert.deepEqual(eligible, { action: "send", forceResend: true });

  const gate = readFileSync(resolve(root, "src/auth-v2/AuthFlowGate.tsx"), "utf8");
  const confirm = gate.slice(gate.indexOf("const handleConfirmSend"), gate.indexOf("const handleVerifyOtp"));
  assert.equal(confirm.match(/sendOtpForWrapper\(/g)?.length, 1);
  assert.match(confirm, /sendOtpForWrapper\(sendPhone\)/);
  assert.equal(confirm.includes("forceResend"), false);
  const resend = gate.slice(gate.indexOf("const handleResend"), gate.indexOf("const handleEmailContinue"));
  assert.ok(resend.indexOf("presentedPhoneResend") < resend.indexOf("beginPhoneOtpSend"));
  assert.match(resend, /startOtp\(sendPhone, \{ forceResend: true \}\)/);
  const launchCall = gate.slice(gate.indexOf("resumeSignedOutPhoneChallenge("), gate.indexOf("if (!cancelled) setHydrated(true);", gate.indexOf("resumeSignedOutPhoneChallenge(")));
  assert.match(launchCall, /phoneOtpRef\.current\.generation/);
  assert.equal(launchCall.includes("startOtp("), false);
  assert.equal(launchCall.includes("sendOtpForWrapper("), false);
  assert.equal(launchCall.includes('setStep("otp")') || launchCall.includes("setStep(\"otp\")"), true);

  const decision = readFileSync(resolve(root, "src/auth-v2/signedOutChallengeResume.ts"), "utf8");
  assert.equal(decision.includes("startOtp"), false);
  assert.equal(decision.includes("signInWithPhoneNumber"), false);
  assert.equal(decision.includes("sendOtpForWrapper"), false);
  assert.match(decision, /loadNativePhoneAuthSession/);
  assert.match(decision, /clearAuthWrapperChallenge/);

  console.log("signedOutChallengeResume.test.ts: ok");
}

void run();
