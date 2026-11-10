/**
 * Runs the production mailbox services against the Firestore emulator.
 * Uses the production Admin token-verification adapter with Auth-emulator phone
 * ID tokens. Emulator credentials do not prove live SMS/email delivery.
 */
import assert from "node:assert/strict";
import type { Firestore } from "firebase-admin/firestore";
import {
  createOrRotateEmailChallenge,
  EMAIL_BINDINGS,
  EMAIL_INDEX,
  PENDING_COLLECTION,
  USERS,
  verifyEmailChallengeAndBind,
} from "./challengeService";
import { emailBindingKey } from "./emailBindingKey";
import { digestEmailOtp } from "./otpCrypto";
import {
  startEmailChangeRequireMobile,
  startEmailChangeNewEmailChallenge,
  completeEmailChangeTransaction,
} from "./emailChange";
import { getAdminAuth } from "../admin";
import { __setEmailProviderForEmulatorTests } from "./provider";

const SECRET = "emulator-only-email-otp-hmac-secret-do-not-use-in-prod";
const PROJECT = process.env.GCLOUD_PROJECT || "demo-vyaamikk-email-budget";
const PHONE = "+919800000099";
const CODE = "246810";

function code(error: unknown): string {
  return String((error as { details?: { code?: string } }).details?.code ?? "");
}

async function seedOwner(db: Firestore, uid: string, email: string, phone = PHONE) {
  const hash = emailBindingKey(email);
  const user = {
    uid, phoneE164: phone, emailStatus: "verified", businessEmail: email,
    normalizedEmail: email, emailHash: hash, emailBindingVersion: 1,
    profileCompletedAt: Date.now() - 10_000, emailReviewChangeCount: 0,
  };
  await db.collection(USERS).doc(uid).set(user);
  await db.collection(EMAIL_BINDINGS).doc(hash).set({
    uid, normalizedEmail: email, status: "verified", bindingVersion: 1,
  });
  await db.collection(EMAIL_INDEX).doc(hash).set({ userId: uid, status: "active", emailStatus: "verified" });
  return user;
}

async function emulatorPhoneToken(uid: string, phone: string): Promise<string> {
  const host = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? "";
  assert.match(host, /^(127\.0\.0\.1|localhost|\[::1\]):\d+$/);
  assert.match(PROJECT, /^demo-/);
  await getAdminAuth().createUser({ uid, phoneNumber: phone });
  const sent = await fetch(`http://${host}/identitytoolkit.googleapis.com/v1/accounts:sendVerificationCode?key=emulator-only`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phoneNumber: phone }),
  });
  assert.equal(sent.ok, true);
  const { sessionInfo } = await sent.json() as { sessionInfo: string };
  const codes = await fetch(`http://${host}/emulator/v1/projects/${PROJECT}/verificationCodes`);
  assert.equal(codes.ok, true);
  const list = await codes.json() as { verificationCodes: Array<{ sessionInfo: string; code: string }> };
  const verification = list.verificationCodes.find((item) => item.sessionInfo === sessionInfo);
  assert.ok(verification);
  const signedIn = await fetch(`http://${host}/identitytoolkit.googleapis.com/v1/accounts:signInWithPhoneNumber?key=emulator-only`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionInfo, code: verification.code }),
  });
  assert.equal(signedIn.ok, true);
  const result = await signedIn.json() as { localId: string; idToken: string };
  assert.equal(result.localId, uid);
  return result.idToken;
}

async function seedChallenge(db: Firestore, uid: string, id: string, email: string, purpose = "bind") {
  const now = Date.now();
  await db.collection(PENDING_COLLECTION).doc(id).set({
    challengeId: id, userId: uid, normalizedEmail: email, emailHash: emailBindingKey(email),
    otpDigest: digestEmailOtp(SECRET, CODE, { challengeId: id, uid, normalizedEmail: email, version: 1 }),
    purpose, version: 1, issuedAt: now, expiresAt: now + 60_000, resendAvailableAt: now,
    incorrectAttempts: 0, lockUntil: null, consumedAt: null, status: "active", idempotencyKey: null,
  });
}

export async function runEmailIdentityFlowRegressions(db: Firestore): Promise<void> {
  const uid = "verified-mailbox-owner";
  const original = await seedOwner(db, uid, "original@example.com");

  // This assertion fails on the reviewed PR55 head: ordinary bind sends and
  // creates a replacement challenge without a fresh current-phone factor.
  await assert.rejects(
    createOrRotateEmailChallenge({ uid, rawEmail: "replacement@example.com", purpose: "bind" }),
    (error) => code(error) === "FORBIDDEN",
    "ordinary onboarding bind must not replace an already verified mailbox"
  );
  await seedChallenge(db, uid, "replacement-bind", "replacement@example.com");
  await assert.rejects(
    verifyEmailChallengeAndBind({ uid, challengeId: "replacement-bind", code: CODE }),
    (error) => code(error) === "FORBIDDEN"
  );
  assert.equal((await db.collection(USERS).doc(uid).get()).get("emailHash"), original.emailHash);
  assert.equal((await db.collection(EMAIL_BINDINGS).doc(original.emailHash).get()).get("uid"), uid);
  assert.equal((await db.collection(EMAIL_BINDINGS).doc(emailBindingKey("replacement@example.com")).get()).exists, false);
  await db.collection(USERS).doc(uid).update({ profileCompletedAt: 0 });
  await assert.rejects(
    createOrRotateEmailChallenge({ uid, rawEmail: "review-replacement@example.com", purpose: "bind" }),
    (error) => code(error) === "FORBIDDEN",
    "a verified factor also requires step-up during signup review"
  );
  await db.collection(USERS).doc(uid).update({ profileCompletedAt: Date.now() - 10_000 });

  const now = Date.now();
  const phoneToken = await emulatorPhoneToken(uid, PHONE);
  await assert.rejects(startEmailChangeRequireMobile({ uid, phoneProofToken: "not-a-valid-token", projectId: PROJECT }),
    (error) => code(error) === "FORBIDDEN");
  {
    const input = { uid, phoneProofToken: phoneToken, nowMs: now, projectId: PROJECT };
    const [first, retried] = await Promise.all([
      startEmailChangeRequireMobile(input), startEmailChangeRequireMobile(input),
    ]);
    assert.deepEqual(retried, first, "lost-response/concurrent retry must recover the same operation");
    assert.equal((await db.collection("emailChangeSessions").where("uid", "==", uid).get()).size, 1);
    assert.deepEqual(
      await startEmailChangeRequireMobile({ ...input, nowMs: now + 6 * 60_000 }), first,
      "a valid committed session remains retrievable after fresh-factor acquisition window expires"
    );

    const challengeInput = {
      uid, changeSessionId: first.changeSessionId, newEmail: "stepped-up@example.com", idempotencyKey: "start-new-1",
    };
    const created = await startEmailChangeNewEmailChallenge(challengeInput);
    const retriedChallenge = await startEmailChangeNewEmailChallenge(challengeInput);
    assert.equal(retriedChallenge.challengeId, created.challengeId, "same issuance retry must not resend or supersede");
    await seedChallenge(db, uid, "foreign-operation-challenge", "different-operation@example.com", "change_new");
    await assert.rejects(completeEmailChangeTransaction({
      uid, changeSessionId: first.changeSessionId, emailChallengeId: "foreign-operation-challenge", emailCode: CODE,
    }), (error) => code(error) === "CONFLICT");
    assert.equal((await db.collection(USERS).doc(uid).get()).get("emailHash"), original.emailHash);

    const pendingRef = db.collection(PENDING_COLLECTION).doc(created.challengeId);
    // A synthetic known digest exercises the real transaction and budget;
    // no email code or provider delivery is used as acceptance evidence.
    const pending = (await pendingRef.get()).data()!;
    await pendingRef.update({ otpDigest: digestEmailOtp(SECRET, CODE, {
      challengeId: created.challengeId, uid, normalizedEmail: pending.normalizedEmail, version: pending.version,
    }) });
    for (const expected of ["EMAIL_OTP_INVALID", "EMAIL_OTP_INVALID", "EMAIL_OTP_LOCKED"]) {
      await assert.rejects(completeEmailChangeTransaction({
        uid, changeSessionId: first.changeSessionId, emailChallengeId: created.challengeId, emailCode: "000000",
      }), (error) => code(error) === expected);
    }
    assert.equal((await pendingRef.get()).get("incorrectAttempts"), 3);
    await assert.rejects(completeEmailChangeTransaction({
      uid, changeSessionId: first.changeSessionId, emailChallengeId: created.challengeId, emailCode: CODE,
    }), (error) => code(error) === "EMAIL_OTP_LOCKED");
  }

  const changingUid = "legitimate-mailbox-owner";
  const changingPhone = "+919800000098";
  const changingOriginal = await seedOwner(db, changingUid, "legitimate-old@example.com", changingPhone);
  const changingToken = await emulatorPhoneToken(changingUid, changingPhone);
  await assert.rejects(startEmailChangeRequireMobile({ uid, phoneProofToken: changingToken, projectId: PROJECT }),
    (error) => code(error) === "FORBIDDEN", "another real Auth user's phone token does not authorize this account");
  {
    const session = await startEmailChangeRequireMobile({
      uid: changingUid, phoneProofToken: changingToken, projectId: PROJECT,
    });
    const challenge = await startEmailChangeNewEmailChallenge({
      uid: changingUid, changeSessionId: session.changeSessionId,
      newEmail: "legitimate-new@example.com", idempotencyKey: null,
    });
    const challengeReplay = await startEmailChangeNewEmailChallenge({
      uid: changingUid, changeSessionId: session.changeSessionId,
      newEmail: "legitimate-new@example.com", idempotencyKey: null,
    });
    assert.equal(challengeReplay.challengeId, challenge.challengeId, "legacy caller without key also has a stable operation");
    const ref = db.collection(PENDING_COLLECTION).doc(challenge.challengeId);
    const pending = (await ref.get()).data()!;
    await ref.update({ otpDigest: digestEmailOtp(SECRET, CODE, {
      challengeId: challenge.challengeId, uid: changingUid, normalizedEmail: pending.normalizedEmail, version: pending.version,
    }) });
    const completion = {
      uid: changingUid, changeSessionId: session.changeSessionId,
      emailChallengeId: challenge.challengeId, emailCode: CODE,
    };
    const completed = await completeEmailChangeTransaction(completion);
    assert.equal(completed.profile.normalizedEmail, "legitimate-new@example.com");
    assert.equal(completed.profile.emailBindingVersion, 2);
    assert.equal((await db.collection(EMAIL_BINDINGS).doc(changingOriginal.emailHash).get()).exists, false);
    assert.equal((await db.collection(EMAIL_BINDINGS).doc(emailBindingKey("legitimate-new@example.com")).get()).get("uid"), changingUid);
    const completedRetry = await completeEmailChangeTransaction(completion);
    assert.equal(completedRetry.profile.emailBindingVersion, 2, "lost completion response does not bind/count twice");
    assert.equal(completedRetry.profile.emailChangeCount, 1);
  }

  const signupUid = "initial-email-owner";
  const signupPhone = "+919800000097";
  await getAdminAuth().createUser({ uid: signupUid, phoneNumber: signupPhone });
  await db.collection(USERS).doc(signupUid).set({ uid: signupUid, phoneE164: signupPhone, emailStatus: "unverified" });
  const signup = await createOrRotateEmailChallenge({ uid: signupUid, rawEmail: "signup@example.com", purpose: "bind" });
  assert.ok(signup.challengeId, "initial email collection remains available");
  assert.equal((await db.collection(USERS).doc(signupUid).get()).get("emailStatus"), "verification_pending");
  const changedSignup = await createOrRotateEmailChallenge({ uid: signupUid, rawEmail: "signup-corrected@example.com", purpose: "bind" });
  assert.notEqual(changedSignup.challengeId, signup.challengeId, "an unverified signup typo remains correctable");
  assert.equal((await db.collection(PENDING_COLLECTION).doc(signup.challengeId).get()).get("status"), "superseded");
  const initialProfile = await verifyEmailChallengeAndBind({
    uid: signupUid, challengeId: changedSignup.challengeId, code: changedSignup.devCodeHint!,
  });
  assert.equal(initialProfile.emailStatus, "verified");
  assert.equal(initialProfile.normalizedEmail, "signup-corrected@example.com");
  assert.equal((await getAdminAuth().getUser(signupUid)).emailVerified, true);

  // A committed challenge is not evidence of provider acceptance. Hold the
  // provider boundary and verify retries neither claim sent nor send again.
  const heldUid = "mail-provider-held";
  await db.collection(USERS).doc(heldUid).set({ uid: heldUid, phoneE164: PHONE, emailStatus: "unverified" });
  let entered!: () => void;
  let release!: () => void;
  const providerEntered = new Promise<void>((resolve) => { entered = resolve; });
  const providerRelease = new Promise<void>((resolve) => { release = resolve; });
  let sends = 0;
  __setEmailProviderForEmulatorTests({ send: async () => {
    sends += 1;
    entered();
    await providerRelease;
    return { delivered: true, provider: "resend" };
  } });
  const heldInput = { uid: heldUid, rawEmail: "held@example.com", purpose: "bind" as const, idempotencyKey: "held-operation" };
  const inFlight = createOrRotateEmailChallenge(heldInput);
  try {
    await providerEntered;
    await assert.rejects(createOrRotateEmailChallenge(heldInput), (error) => code(error) === "EMAIL_PROVIDER_UNAVAILABLE");
    assert.equal(sends, 1);
    release();
    const accepted = await inFlight;
    const replay = await createOrRotateEmailChallenge(heldInput);
    assert.equal(replay.challengeId, accepted.challengeId);
    assert.equal(replay.sent, true);
    assert.equal(sends, 1);
  } finally {
    release();
    await inFlight.catch(() => undefined);
    __setEmailProviderForEmulatorTests(null);
  }

  const failedUid = "mail-provider-failed";
  await db.collection(USERS).doc(failedUid).set({ uid: failedUid, phoneE164: PHONE, emailStatus: "unverified" });
  let failedSends = 0;
  __setEmailProviderForEmulatorTests({ send: async () => {
    failedSends += 1;
    return { delivered: false, provider: "resend", errorCode: "EMAIL_PROVIDER_UNAVAILABLE" };
  } });
  try {
    const failedInput = { uid: failedUid, rawEmail: "failed@example.com", purpose: "bind" as const, idempotencyKey: "failed-operation" };
    await assert.rejects(createOrRotateEmailChallenge(failedInput), (error) => code(error) === "EMAIL_PROVIDER_UNAVAILABLE");
    await assert.rejects(createOrRotateEmailChallenge(failedInput), (error) => code(error) === "EMAIL_PROVIDER_UNAVAILABLE");
    assert.equal(failedSends, 1, "retrying the same failed operation must not automatically send another email");
    const rows = await db.collection(PENDING_COLLECTION).where("userId", "==", failedUid).get();
    assert.equal(rows.size, 1);
    assert.equal(rows.docs[0]!.get("providerAcceptance"), "failed");
    assert.equal(rows.docs[0]!.get("status"), "superseded");
  } finally {
    __setEmailProviderForEmulatorTests(null);
  }
  console.log("emailIdentityFlows.emulator.test.ts: ok");
}
