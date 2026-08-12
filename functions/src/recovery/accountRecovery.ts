/**
 * Account recovery + 24h cooling-off (server-authoritative).
 */

import { HttpsError, onCall } from "firebase-functions/v2/https";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

import { getAdminAuth, getAdminDb } from "../admin";
import {
  createOrRotateEmailChallenge,
  PENDING_COLLECTION,
  throwEmailOtpError,
  USERS,
  type ChallengeDoc,
} from "../email/challengeService";
import { verifyEmailOtpDigest } from "../email/otpCrypto";
import { EMAIL_OTP_USER_MESSAGES } from "../email/otpPolicy";
import { resolveEmailProvider } from "../email/provider";
import { EMAIL_OTP_RUNTIME_SECRETS } from "../email/secrets";
import {
  assertMobileNotQuarantined,
  applyDeferredMobileQuarantineRelease,
  sha256MobileHash,
} from "../identity/mobileQuarantine";
import { normalizePhoneE164 } from "../identity/shared";

const RECOVERY_SESSIONS = "accountRecoverySessions";
const SUPPORT_CASES = "manualRecoveryCases";
const COOLING_OFF_MS = 24 * 60 * 60 * 1000;
const RECOVERY_LOCK_MS = 60 * 60 * 1000;

const emailOtpCallOpts = {
  region: "asia-south1" as const,
  secrets: EMAIL_OTP_RUNTIME_SECRETS,
};

function requireUid(request: { auth?: { uid?: string } | null }): string {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", EMAIL_OTP_USER_MESSAGES.UNAUTHENTICATED, {
      code: "UNAUTHENTICATED",
    });
  }
  return uid;
}

function resolveOtpSecret(): string {
  const secret = process.env.EMAIL_OTP_HMAC_SECRET?.trim();
  if (secret && secret.length >= 32) return secret;
  if (process.env.FUNCTIONS_EMULATOR === "true") {
    return "emulator-only-email-otp-hmac-secret-do-not-use-in-prod";
  }
  throwEmailOtpError("EMAIL_PROVIDER_UNAVAILABLE");
}

function digestAnswer(sessionId: string, questionId: string, normalizedAnswer: string): string {
  return createHash("sha256")
    .update(`recovery|${sessionId}|${questionId}|${normalizedAnswer}`, "utf8")
    .digest("hex");
}

function normalizeAnswer(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, " ");
}

interface RecoveryQuestion {
  id: string;
  prompt: string;
  answerDigest: string;
}

function buildRecoveryQuestions(
  sessionId: string,
  user: Record<string, unknown>
): RecoveryQuestion[] | null {
  const createdAt = Number(user.createdAt ?? 0);
  const workType = String(user.workType ?? "").trim();
  const designation = String(user.designation ?? "").trim();
  const businessName = String(user.businessName ?? "").trim();

  const qs: RecoveryQuestion[] = [];

  if (createdAt > 0) {
    const year = new Date(createdAt).getUTCFullYear();
    const id = "acct_year";
    qs.push({
      id,
      prompt: "In which calendar year was this Vyaamikk Diary account created?",
      answerDigest: digestAnswer(sessionId, id, String(year)),
    });
  }
  if (workType.length >= 3) {
    const id = "work_type";
    qs.push({
      id,
      prompt: "What type of work did you save on your profile? (exact phrase you entered)",
      answerDigest: digestAnswer(sessionId, id, normalizeAnswer(workType)),
    });
  }
  if (designation.length >= 2) {
    const id = "designation";
    qs.push({
      id,
      prompt: "What designation / role did you save on your profile?",
      answerDigest: digestAnswer(sessionId, id, normalizeAnswer(designation)),
    });
  }
  if (businessName.length >= 2 && qs.length < 3) {
    const id = "business_name";
    qs.push({
      id,
      prompt: "What business / shop name is saved on your profile?",
      answerDigest: digestAnswer(sessionId, id, normalizeAnswer(businessName)),
    });
  }

  if (qs.length < 3) return null;
  return qs.slice(0, 3);
}

export const startAccountRecovery = onCall(emailOtpCallOpts, async (request) => {
  const uid = requireUid(request);
  const db = getAdminDb();
  const userRef = db.collection(USERS).doc(uid);
  const userSnap = await userRef.get();
  if (!userSnap.exists) throwEmailOtpError("FORBIDDEN", "permission-denied");
  const user = userSnap.data() as Record<string, unknown>;

  if (user.emailStatus !== "verified" || !user.normalizedEmail) {
    throwEmailOtpError("EMAIL_VERIFICATION_REQUIRED");
  }

  const lockUntil = Number(user.recoveryLockUntil ?? 0);
  if (lockUntil > Date.now()) throwEmailOtpError("RATE_LIMITED", "resource-exhausted");

  const sessionId = randomBytes(16).toString("hex");
  const questions = buildRecoveryQuestions(sessionId, user);
  if (!questions) {
    const caseId = randomBytes(8).toString("hex");
    await db.collection(SUPPORT_CASES).doc(caseId).set({
      caseId,
      uid,
      status: "open",
      reason: "insufficient_safe_history",
      createdAt: Date.now(),
    });
    return {
      mode: "manual_support" as const,
      caseId,
      message:
        "Automated recovery is unavailable for this account. A support case was opened. Never send OTPs or secret answers by email.",
    };
  }

  const emailChallenge = await createOrRotateEmailChallenge({
    uid,
    rawEmail: String(user.normalizedEmail),
    purpose: "recovery",
  });

  const now = Date.now();
  await db.collection(RECOVERY_SESSIONS).doc(sessionId).set({
    sessionId,
    uid,
    status: "awaiting_factors",
    emailChallengeId: emailChallenge.challengeId,
    questions: questions.map((q) => ({ id: q.id, prompt: q.prompt, answerDigest: q.answerDigest })),
    emailFactorAt: null,
    questionsFactorAt: null,
    failedAttempts: 0,
    expiresAt: now + 30 * 60 * 1000,
    createdAt: now,
  });
  await userRef.update({ recoveryPending: true, updatedAt: now });

  return {
    mode: "automated" as const,
    sessionId,
    emailChallengeId: emailChallenge.challengeId,
    maskedEmail: emailChallenge.maskedEmail,
    expiresAt: emailChallenge.expiresAt,
    resendAvailableAt: emailChallenge.resendAvailableAt,
    questions: questions.map((q) => ({ id: q.id, prompt: q.prompt })),
    devCodeHint: emailChallenge.devCodeHint,
  };
});

export const completeAccountRecovery = onCall(emailOtpCallOpts, async (request) => {
  const uid = requireUid(request);
  const sessionId = String(request.data?.sessionId ?? "");
  const emailCode = String(request.data?.emailCode ?? "");
  const newPhoneE164 = String(request.data?.newPhoneE164 ?? "");
  const newPhoneVerificationId = String(request.data?.newPhoneVerificationId ?? "");
  const newPhoneCode = String(request.data?.newPhoneCode ?? "");
  const answers = request.data?.answers as Record<string, string> | undefined;

  if (!sessionId || !emailCode || !newPhoneE164 || !answers) {
    throw new HttpsError("invalid-argument", "Missing recovery fields.");
  }
  if (!newPhoneVerificationId || newPhoneCode.length < 6) {
    throwEmailOtpError("FORBIDDEN", "permission-denied");
  }

  const db = getAdminDb();
  const secret = resolveOtpSecret();
  const sessionRef = db.collection(RECOVERY_SESSIONS).doc(sessionId);
  const userRef = db.collection(USERS).doc(uid);

  const result = await db.runTransaction(async (tx) => {
    const sessionSnap = await tx.get(sessionRef);
    const userSnap = await tx.get(userRef);
    if (!sessionSnap.exists || !userSnap.exists) throwEmailOtpError("CONFLICT", "aborted");
    const session = sessionSnap.data() as {
      uid: string;
      status: string;
      emailChallengeId: string;
      questions: Array<{ id: string; prompt: string; answerDigest: string }>;
      failedAttempts: number;
      expiresAt: number;
    };
    const user = userSnap.data() as Record<string, unknown>;
    if (session.uid !== uid) throwEmailOtpError("FORBIDDEN", "permission-denied");
    if (session.status === "completed") {
      return { alreadyDone: true as const, coolingOffUntil: Number(user.coolingOffUntil ?? 0) };
    }
    if (session.expiresAt < Date.now()) throwEmailOtpError("EMAIL_OTP_EXPIRED", "deadline-exceeded");

    const pendingRef = db.collection(PENDING_COLLECTION).doc(session.emailChallengeId);
    const pendingSnap = await tx.get(pendingRef);
    if (!pendingSnap.exists) throwEmailOtpError("EMAIL_OTP_EXPIRED", "not-found");
    const pending = pendingSnap.data() as ChallengeDoc;

    const emailOk = verifyEmailOtpDigest(
      secret,
      emailCode,
      {
        challengeId: pending.challengeId,
        uid: pending.userId,
        normalizedEmail: pending.normalizedEmail,
        version: pending.version,
      },
      pending.otpDigest
    );

    let answersOk = true;
    for (const q of session.questions) {
      const submitted = normalizeAnswer(String(answers[q.id] ?? ""));
      const digest = digestAnswer(sessionId, q.id, submitted);
      const a = Buffer.from(digest, "utf8");
      const b = Buffer.from(q.answerDigest, "utf8");
      if (a.length !== b.length || !timingSafeEqual(a, b)) answersOk = false;
    }

    if (!emailOk || !answersOk) {
      const failed = (session.failedAttempts ?? 0) + 1;
      const lockUntil = Date.now() + RECOVERY_LOCK_MS;
      tx.update(sessionRef, { failedAttempts: failed, status: "failed_attempt" });
      tx.update(userRef, {
        recoveryLockUntil: lockUntil,
        recoveryPending: false,
        updatedAt: Date.now(),
      });
      tx.set(userRef.collection("securityEvents").doc(), {
        type: "recovery_failed",
        result: "failure",
        attempt: failed,
        createdAt: Date.now(),
        expireAt: Date.now() + 90 * 86_400_000,
      });
      return { failed: true as const, attempt: failed, lockUntil };
    }

    // Phone uniqueness + quarantine (server must enforce; hash never raw E.164)
    // All remaining reads must finish before any write (Firestore transaction ordering).
    const newPhoneNorm = normalizePhoneE164(newPhoneE164);
    const newMobileHash = sha256MobileHash(newPhoneNorm);
    const now = Date.now();
    const quarantine = await assertMobileNotQuarantined(tx, newMobileHash, now);

    const phoneIndexRef = db.collection("phoneIndex").doc(newPhoneNorm);
    const phoneSnap = await tx.get(phoneIndexRef);
    if (phoneSnap.exists) {
      const owner = (phoneSnap.data() as { uid?: string }).uid;
      if (owner && owner !== uid) throwEmailOtpError("CONFLICT", "aborted");
    }

    const oldPhone = String(user.phoneE164 ?? "");
    const coolingOffUntil = now + COOLING_OFF_MS;
    const recoveryDeviceId =
      typeof request.data?.recoveryDeviceId === "string" && request.data.recoveryDeviceId
        ? request.data.recoveryDeviceId
        : randomBytes(8).toString("hex");

    applyDeferredMobileQuarantineRelease(tx, newMobileHash, now, quarantine.releaseDue);
    if (oldPhone && normalizePhoneE164(oldPhone) !== newPhoneNorm) {
      tx.delete(db.collection("phoneIndex").doc(normalizePhoneE164(oldPhone)));
    }
    tx.set(phoneIndexRef, { uid, phoneE164: newPhoneNorm, updatedAt: now });

    tx.update(userRef, {
      phoneE164: newPhoneNorm,
      mobileLinkedAt: now,
      mobileChangedAt: now,
      mobileChangeCount: Number(user.mobileChangeCount ?? 0) + 1,
      recoveryPending: false,
      coolingOffUntil,
      trustedRecoveryDeviceId: recoveryDeviceId,
      identityUpdatedAt: now,
      updatedAt: now,
    });
    tx.update(pendingRef, { status: "consumed", consumedAt: now, otpDigest: null });
    tx.update(sessionRef, {
      status: "completed",
      completedAt: now,
      recoveryDeviceId,
      coolingOffUntil,
    });
    tx.set(userRef.collection("securityEvents").doc(), {
      type: "recovery_completed",
      result: "success",
      createdAt: now,
      expireAt: now + 90 * 86_400_000,
    });

    return {
      failed: false as const,
      coolingOffUntil,
      recoveryDeviceId,
      oldPhone,
      email: String(user.normalizedEmail),
    };
  });

  if ("failed" in result && result.failed) {
    if (result.attempt >= 2) {
      const userSnap = await userRef.get();
      const email = String((userSnap.data() as Record<string, unknown>)?.normalizedEmail ?? "");
      if (email) {
        const { provider } = resolveEmailProvider();
        await provider.send({
          to: email,
          subject: "Security alert: account recovery attempt failed",
          textBody:
            "Someone attempted account recovery on your Vyaamikk Diary account and failed. If this was not you, contact support. Do not share OTPs or codes.",
          idempotencyKey: `recovery-fail-alert:${sessionId}:${result.attempt}`,
        });
      }
    }
    throwEmailOtpError("FORBIDDEN", "permission-denied");
  }

  if ("alreadyDone" in result && result.alreadyDone) {
    return { ok: true, coolingOffUntil: result.coolingOffUntil };
  }

  // Account-wide token revocation, then mint fresh session for recovery device.
  await getAdminAuth().revokeRefreshTokens(uid);
  const customToken = await getAdminAuth().createCustomToken(uid, {
    recoveryDeviceId: result.recoveryDeviceId,
    recoverySession: true,
  });

  const { provider } = resolveEmailProvider();
  await provider.send({
    to: result.email,
    subject: "Your Vyaamikk Diary mobile number was recovered",
    textBody:
      "Account recovery succeeded and your mobile number was updated. A 24-hour cooling-off period now limits high-risk identity actions. If this was not you, contact support immediately.",
    idempotencyKey: `recovery-complete-email:${sessionId}`,
  });

  return {
    ok: true,
    coolingOffUntil: result.coolingOffUntil,
    recoveryDeviceId: result.recoveryDeviceId,
    customToken,
    note:
      "All prior refresh tokens were revoked. Sign in on this device with the returned customToken (or complete native phone auth for the new number) to restore only the recovery session.",
  };
});

export const openManualRecoveryCase = onCall({ region: "asia-south1" }, async (request) => {
  const uid = requireUid(request);
  const caseId = randomBytes(8).toString("hex");
  await getAdminDb()
    .collection(SUPPORT_CASES)
    .doc(caseId)
    .set({
      caseId,
      uid,
      status: "open",
      reason: "user_requested",
      createdAt: Date.now(),
      instructions:
        "Support may request ownership evidence. Never email OTPs, passwords, or recovery answers.",
    });
  return { caseId, status: "open" };
});

/** Admin/support-only — requires callable auth + support claim (documented; enforce via IAM). */
export const resolveManualRecoveryCase = onCall(emailOtpCallOpts, async (request) => {
  const reviewerUid = requireUid(request);
  const supportClaim = request.auth?.token?.support === true;
  if (!supportClaim && process.env.FUNCTIONS_EMULATOR !== "true") {
    throw new HttpsError("permission-denied", "Support authorization required.");
  }
  const caseId = String(request.data?.caseId ?? "");
  const decision = request.data?.decision === "approve" ? "approve" : "reject";
  const db = getAdminDb();
  const caseRef = db.collection(SUPPORT_CASES).doc(caseId);
  const snap = await caseRef.get();
  if (!snap.exists) throw new HttpsError("not-found", "Case not found.");
  const data = snap.data() as { uid: string; status: string };
  if (data.status !== "open") throw new HttpsError("failed-precondition", "Case already resolved.");

  await caseRef.update({
    status: decision === "approve" ? "approved" : "rejected",
    reviewedBy: reviewerUid,
    reviewedAt: Date.now(),
  });

  const userSnap = await db.collection(USERS).doc(data.uid).get();
  const email = String((userSnap.data() as Record<string, unknown>)?.normalizedEmail ?? "");
  if (email) {
    const { provider } = resolveEmailProvider();
    await provider.send({
      to: email,
      subject:
        decision === "approve"
          ? "Support approved your recovery case"
          : "Support update on your recovery case",
      textBody:
        decision === "approve"
          ? `Case ${caseId} was approved. Complete new-mobile verification in the app. A 24-hour cooling-off will apply after success.`
          : `Case ${caseId} was not approved. Contact support if you need further help. Never share OTPs by email.`,
      idempotencyKey: `manual-recovery:${caseId}:${decision}`,
    });
  }

  return { caseId, status: decision === "approve" ? "approved" : "rejected" };
});
