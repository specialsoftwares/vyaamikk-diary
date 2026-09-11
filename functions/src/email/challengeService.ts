import { HttpsError } from "firebase-functions/v2/https";
import type { DocumentReference, Firestore, Transaction } from "firebase-admin/firestore";

import { getAdminDb } from "../admin";
import { emailBindingKey } from "./emailBindingKey";
import {
  EMAIL_OTP_LOCK_MS,
  EMAIL_OTP_MAX_ATTEMPTS,
  EMAIL_OTP_MAX_DISTINCT_EMAILS_PER_UID_DAY,
  EMAIL_OTP_MAX_SENDS_PER_EMAIL_HOUR,
  EMAIL_OTP_MAX_SENDS_PER_UID_HOUR,
  EMAIL_OTP_RESEND_COOLDOWN_MS,
  EMAIL_OTP_TTL_MS,
  EMAIL_OTP_USER_MESSAGES,
  type EmailOtpServerErrorCode,
  isValidEmailSyntaxServer,
  normalizeEmailStrict,
} from "./otpPolicy";
import { digestEmailOtp, generateEmailOtpCode, verifyEmailOtpDigest } from "./otpCrypto";
import { resolveEmailProvider } from "./provider";
import {
  assertReviewContactEditAllowed,
  nextReviewContactEditCount,
  shouldCountSuccessfulReviewContactReplacement,
} from "../identity/reviewContactEditPolicy";
import {
  isAuthoritativeVerifiedEmailOwnership,
  pickActivePendingForPolicy,
  rotationActionForStart,
  shouldEnforceResendCooldown,
  shouldWriteUnverifiedPendingUserFields,
} from "./pendingEmailPolicy";

export const PENDING_COLLECTION = "pendingEmailVerifications";
export const EMAIL_BINDINGS = "emailBindings";
export const EMAIL_INDEX = "emailIndex"; // legacy mirror for existing readers
export const USERS = "users";
export const SECURITY_EVENTS = "securityEvents";
export const EMAIL_OTP_RATE = "emailOtpRateLimits";

function otpSecret(): string {
  const secret = process.env.EMAIL_OTP_HMAC_SECRET?.trim();
  if (secret && secret.length >= 32) return secret;
  if (process.env.FUNCTIONS_EMULATOR === "true") {
    return "emulator-only-email-otp-hmac-secret-do-not-use-in-prod";
  }
  throw new HttpsError(
    "failed-precondition",
    EMAIL_OTP_USER_MESSAGES.EMAIL_PROVIDER_UNAVAILABLE,
    { code: "EMAIL_PROVIDER_UNAVAILABLE" satisfies EmailOtpServerErrorCode }
  );
}

export function throwEmailOtpError(
  code: EmailOtpServerErrorCode,
  httpsCode:
    | "invalid-argument"
    | "failed-precondition"
    | "permission-denied"
    | "unauthenticated"
    | "resource-exhausted"
    | "not-found"
    | "deadline-exceeded"
    | "aborted" = "failed-precondition",
  details?: Record<string, string | number | boolean | null>
): never {
  throw new HttpsError(httpsCode, EMAIL_OTP_USER_MESSAGES[code], { code, ...details });
}

function cooldownDetails(resendAvailableAt: number, now = Date.now()) {
  return {
    resendAvailableAt,
    retryAfterSeconds: Math.max(0, Math.ceil((resendAvailableAt - now) / 1000)),
  };
}

function rateDocId(kind: string, key: string): string {
  return `${kind}_${key}`;
}

async function assertSendRateLimits(
  db: Firestore,
  uid: string,
  normalizedEmail: string,
  now: number
): Promise<void> {
  const hourKey = Math.floor(now / 3_600_000);
  const dayKey = Math.floor(now / 86_400_000);
  const uidHourRef = db.collection(EMAIL_OTP_RATE).doc(rateDocId("uidHour", `${uid}_${hourKey}`));
  const emailHourRef = db
    .collection(EMAIL_OTP_RATE)
    .doc(rateDocId("emailHour", `${emailBindingKey(normalizedEmail)}_${hourKey}`));
  const uidDayRef = db.collection(EMAIL_OTP_RATE).doc(rateDocId("uidDayEmails", `${uid}_${dayKey}`));

  await db.runTransaction(async (tx) => {
    const [uidHourSnap, emailHourSnap, uidDaySnap] = await Promise.all([
      tx.get(uidHourRef),
      tx.get(emailHourRef),
      tx.get(uidDayRef),
    ]);

    const uidHourCount = Number(uidHourSnap.data()?.count ?? 0);
    const emailHourCount = Number(emailHourSnap.data()?.count ?? 0);
    const emailsTried: string[] = Array.isArray(uidDaySnap.data()?.emails)
      ? (uidDaySnap.data()!.emails as string[])
      : [];

    if (uidHourCount >= EMAIL_OTP_MAX_SENDS_PER_UID_HOUR) {
      throwEmailOtpError("RATE_LIMITED", "resource-exhausted");
    }
    if (emailHourCount >= EMAIL_OTP_MAX_SENDS_PER_EMAIL_HOUR) {
      throwEmailOtpError("RATE_LIMITED", "resource-exhausted");
    }
    const nextEmails = emailsTried.includes(normalizedEmail)
      ? emailsTried
      : [...emailsTried, normalizedEmail];
    if (
      !emailsTried.includes(normalizedEmail) &&
      nextEmails.length > EMAIL_OTP_MAX_DISTINCT_EMAILS_PER_UID_DAY
    ) {
      throwEmailOtpError("RATE_LIMITED", "resource-exhausted");
    }

    tx.set(
      uidHourRef,
      { count: uidHourCount + 1, updatedAt: now, expireAt: now + 2 * 3_600_000 },
      { merge: true }
    );
    tx.set(
      emailHourRef,
      { count: emailHourCount + 1, updatedAt: now, expireAt: now + 2 * 3_600_000 },
      { merge: true }
    );
    tx.set(
      uidDayRef,
      { emails: nextEmails, updatedAt: now, expireAt: now + 2 * 86_400_000 },
      { merge: true }
    );
  });
}

export interface ChallengeDoc {
  challengeId: string;
  userId: string;
  normalizedEmail: string;
  emailHash: string;
  otpDigest: string;
  version: number;
  issuedAt: number;
  expiresAt: number;
  resendAvailableAt: number;
  incorrectAttempts: number;
  lockUntil: number | null;
  consumedAt: number | null;
  status: "active" | "consumed" | "superseded" | "locked";
  idempotencyKey: string | null;
  purpose: "bind" | "change_new" | "change_confirm_old_mobile" | "recovery";
}

async function writeSecurityEvent(
  db: Firestore,
  uid: string,
  event: Record<string, unknown>
): Promise<void> {
  const now = Date.now();
  await db.collection(USERS).doc(uid).collection(SECURITY_EVENTS).add({
    ...event,
    createdAt: now,
    expireAt: now + 90 * 86_400_000,
  });
}

export async function assertEmailNotBoundElsewhere(
  tx: Transaction,
  db: Firestore,
  emailHash: string,
  uid: string
): Promise<void> {
  const bindingRef = db.collection(EMAIL_BINDINGS).doc(emailHash);
  const legacyRef = db.collection(EMAIL_INDEX).doc(emailHash);
  const [bindingSnap, legacySnap] = await Promise.all([tx.get(bindingRef), tx.get(legacyRef)]);

  for (const snap of [bindingSnap, legacySnap]) {
    if (!snap.exists) continue;
    const data = snap.data() as { uid?: string; userId?: string; status?: string; emailStatus?: string };
    const owner = data.uid ?? data.userId;
    const verified = isAuthoritativeVerifiedEmailOwnership(data);
    if (owner && owner !== uid && verified) {
      throwEmailOtpError("EMAIL_ALREADY_BOUND");
    }
  }
}

export async function createOrRotateEmailChallenge(input: {
  uid: string;
  rawEmail: string;
  purpose?: ChallengeDoc["purpose"];
  idempotencyKey?: string | null;
  requirePhoneVerified?: boolean;
}): Promise<{
  challengeId: string;
  maskedEmail: string;
  expiresAt: number;
  resendAvailableAt: number;
  version: number;
  sent: boolean;
  devCodeHint?: string;
}> {
  const authUid = input.uid;
  if (!isValidEmailSyntaxServer(input.rawEmail)) {
    throwEmailOtpError("EMAIL_INVALID", "invalid-argument");
  }
  const normalized = normalizeEmailStrict(input.rawEmail);
  const emailHash = emailBindingKey(normalized);
  const db = getAdminDb();
  const now = Date.now();
  const secret = otpSecret();
  const purpose = input.purpose ?? "bind";

  // Fail closed before mutating profile / burning rate limits when mail is misconfigured.
  const { provider, mode } = resolveEmailProvider();
  if (mode === "unavailable" && process.env.FUNCTIONS_EMULATOR !== "true") {
    throwEmailOtpError("EMAIL_PROVIDER_UNAVAILABLE");
  }

  const userRef = db.collection(USERS).doc(authUid);
  const userSnap = await userRef.get();
  if (!userSnap.exists) throwEmailOtpError("FORBIDDEN", "permission-denied");
  const user = userSnap.data() as Record<string, unknown>;

  if (input.requirePhoneVerified !== false) {
    const phone = String(user.phoneE164 ?? "");
    if (!phone.startsWith("+")) {
      throwEmailOtpError("FORBIDDEN", "permission-denied");
    }
  }

  const currentVerified =
    user.emailStatus === "verified"
      ? normalizeEmailStrict(String(user.normalizedEmail ?? user.businessEmail ?? ""))
      : "";
  const replacingVerified = Boolean(currentVerified && currentVerified !== normalized);
  if (replacingVerified) {
    const reviewGate = assertReviewContactEditAllowed({
      channel: "email",
      count: user.emailReviewChangeCount,
      profileCompletedAt:
        typeof user.profileCompletedAt === "number" ? user.profileCompletedAt : null,
    });
    if (!reviewGate.ok) throwEmailOtpError("EMAIL_REVIEW_EDIT_LIMIT");
  }

  const bindingSnap = await db.collection(EMAIL_BINDINGS).doc(emailHash).get();
  const legacySnap = await db.collection(EMAIL_INDEX).doc(emailHash).get();
  for (const snap of [bindingSnap, legacySnap]) {
    if (!snap.exists) continue;
    const data = snap.data() as { uid?: string; userId?: string; status?: string; emailStatus?: string };
    const owner = data.uid ?? data.userId;
    const verified = isAuthoritativeVerifiedEmailOwnership(data);
    if (owner && owner !== authUid && verified) {
      throwEmailOtpError("EMAIL_ALREADY_BOUND");
    }
  }

  const lockUntil = Number(user.emailVerificationLockUntil ?? 0);
  if (
    lockUntil > now &&
    normalizeEmailStrict(String(user.emailVerificationLockedEmail ?? "")) === normalized
  ) {
    throwEmailOtpError("EMAIL_OTP_LOCKED");
  }

  // Cooldown applies only to same-email resend of an unexpired challenge.
  // A different unverified address is a replace, never a conflict.
  {
    const priorAll = await db.collection(PENDING_COLLECTION).where("userId", "==", authUid).get();
    const active = priorAll.docs
      .map((d) => d.data() as ChallengeDoc)
      .filter((data) => data.purpose === purpose && data.status === "active");
    const picked = pickActivePendingForPolicy(active, normalized, now);
    const action = rotationActionForStart({
      currentVerifiedNormalized: currentVerified,
      submittedNormalized: normalized,
      pending: picked,
      now,
    });
    if (shouldEnforceResendCooldown(action, picked, now) && picked) {
      throwEmailOtpError(
        "EMAIL_OTP_COOLDOWN",
        "resource-exhausted",
        cooldownDetails(picked.resendAvailableAt, now)
      );
    }
  }

  await assertSendRateLimits(db, authUid, normalized, now);

  // Idempotent replay: same key + same email within TTL returns existing challenge.
  if (input.idempotencyKey) {
    const existing = await db
      .collection(PENDING_COLLECTION)
      .where("userId", "==", authUid)
      .where("idempotencyKey", "==", input.idempotencyKey)
      .limit(1)
      .get();
    if (!existing.empty) {
      const doc = existing.docs[0]!.data() as ChallengeDoc;
      if (doc.status === "active" && doc.expiresAt > now && doc.normalizedEmail === normalized) {
        return {
          challengeId: doc.challengeId,
          maskedEmail: mask(normalized),
          expiresAt: doc.expiresAt,
          resendAvailableAt: doc.resendAvailableAt,
          version: doc.version,
          sent: true,
        };
      }
    }
  }

  const issued = await db.runTransaction(async (tx) => {
    const userSnapTx = await tx.get(userRef);
    if (!userSnapTx.exists) throwEmailOtpError("FORBIDDEN", "permission-denied");
    const userTx = userSnapTx.data() as Record<string, unknown>;
    const currentVerifiedTx =
      userTx.emailStatus === "verified"
        ? normalizeEmailStrict(String(userTx.normalizedEmail ?? userTx.businessEmail ?? ""))
        : "";

    const pendingQuery = db.collection(PENDING_COLLECTION).where("userId", "==", authUid);
    const priorAll = await tx.get(pendingQuery);
    const prior = priorAll.docs.filter((d) => {
      const data = d.data() as ChallengeDoc;
      return data.purpose === purpose && data.status === "active";
    });
    const active = prior.map((d) => d.data() as ChallengeDoc);
    const picked = pickActivePendingForPolicy(active, normalized, now);
    const action = rotationActionForStart({
      currentVerifiedNormalized: currentVerifiedTx,
      submittedNormalized: normalized,
      pending: picked,
      now,
    });
    if (shouldEnforceResendCooldown(action, picked, now) && picked) {
      throwEmailOtpError(
        "EMAIL_OTP_COOLDOWN",
        "resource-exhausted",
        cooldownDetails(picked.resendAvailableAt, now)
      );
    }

    let nextVersion = 1;
    for (const d of prior) {
      const data = d.data() as ChallengeDoc;
      nextVersion = Math.max(nextVersion, (data.version ?? 0) + 1);
    }

    const challengeId = db.collection(PENDING_COLLECTION).doc().id;
    const code = generateEmailOtpCode();
    const otpDigest = digestEmailOtp(secret, code, {
      challengeId,
      uid: authUid,
      normalizedEmail: normalized,
      version: nextVersion,
    });
    const expiresAt = now + EMAIL_OTP_TTL_MS;
    const resendAvailableAt = now + EMAIL_OTP_RESEND_COOLDOWN_MS;

    for (const d of prior) {
      tx.update(d.ref, { status: "superseded", otpDigest: null });
    }

    const challenge: ChallengeDoc = {
      challengeId,
      userId: authUid,
      normalizedEmail: normalized,
      emailHash,
      otpDigest,
      version: nextVersion,
      issuedAt: now,
      expiresAt,
      resendAvailableAt,
      incorrectAttempts: 0,
      lockUntil: null,
      consumedAt: null,
      status: "active",
      idempotencyKey: input.idempotencyKey ?? null,
      purpose,
    };
    tx.set(db.collection(PENDING_COLLECTION).doc(challengeId), challenge);

    // Pending fields are disposable onboarding state. Never strip a verified email.
    if (shouldWriteUnverifiedPendingUserFields(currentVerifiedTx)) {
      tx.update(userRef, {
        emailStatus: "verification_pending",
        normalizedEmail: normalized,
        businessEmail: normalized,
        emailHash,
        emailVerifiedAt: null,
        updatedAt: now,
      });
    } else {
      tx.update(userRef, { updatedAt: now });
    }

    return { challengeId, code, nextVersion, expiresAt, resendAvailableAt };
  });

  const { challengeId, code, nextVersion, expiresAt, resendAvailableAt } = issued;

  const sendResult = await provider.send({
    to: normalized,
    subject: "Your Vyaamikk Diary verification code",
    textBody: `Your verification code is ${code}. It expires in 15 minutes. If you did not request this, ignore this email.`,
    idempotencyKey: `email-otp:${challengeId}:v${nextVersion}`,
  });

  if (!sendResult.delivered && mode === "production") {
    try {
      await db.collection(PENDING_COLLECTION).doc(challengeId).update({
        status: "superseded",
        otpDigest: null,
      });
    } catch {
      // Delivery failed; still report provider error. Challenge must not stay active.
    }
    throwEmailOtpError("EMAIL_PROVIDER_UNAVAILABLE");
  }

  const emulatorHint =
    process.env.FUNCTIONS_EMULATOR === "true" || process.env.EMAIL_PROVIDER_FORCE_DEV === "1"
      ? code
      : undefined;

  return {
    challengeId,
    maskedEmail: mask(normalized),
    expiresAt,
    resendAvailableAt,
    version: nextVersion,
    sent: sendResult.delivered,
    devCodeHint: emulatorHint,
  };
}

function mask(email: string): string {
  const at = email.indexOf("@");
  if (at <= 0) return "***";
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  const maskedLocal = local.length <= 2 ? `${local[0] ?? "*"}***` : `${local.slice(0, 2)}***`;
  return `${maskedLocal}@${domain}`;
}

export async function verifyEmailChallengeAndBind(input: {
  uid: string;
  challengeId: string;
  code: string;
  idempotencyKey?: string | null;
}): Promise<Record<string, unknown>> {
  const db = getAdminDb();
  const secret = otpSecret();
  const pendingRef = db.collection(PENDING_COLLECTION).doc(input.challengeId);
  const userRef = db.collection(USERS).doc(input.uid);

  const profile = await db.runTransaction(async (tx) => {
    const pendingSnap = await tx.get(pendingRef);
    if (!pendingSnap.exists) throwEmailOtpError("EMAIL_OTP_EXPIRED", "not-found");
    const pending = pendingSnap.data() as ChallengeDoc;

    if (pending.userId !== input.uid) throwEmailOtpError("FORBIDDEN", "permission-denied");

    // Idempotent success replay
    if (pending.status === "consumed" && pending.consumedAt) {
      const userSnap = await tx.get(userRef);
      if (!userSnap.exists) throwEmailOtpError("FORBIDDEN", "permission-denied");
      const u = userSnap.data() as Record<string, unknown>;
      if (u.emailStatus === "verified" && u.normalizedEmail === pending.normalizedEmail) {
        return { uid: input.uid, ...u };
      }
    }

    if (pending.status === "superseded") throwEmailOtpError("CONFLICT", "aborted");
    if (pending.status === "locked" || (pending.lockUntil && pending.lockUntil > Date.now())) {
      throwEmailOtpError("EMAIL_OTP_LOCKED");
    }
    if (pending.expiresAt < Date.now()) {
      tx.update(pendingRef, { status: "superseded", otpDigest: null });
      throwEmailOtpError("EMAIL_OTP_EXPIRED", "deadline-exceeded");
    }

    const ok = verifyEmailOtpDigest(
      secret,
      input.code,
      {
        challengeId: pending.challengeId,
        uid: pending.userId,
        normalizedEmail: pending.normalizedEmail,
        version: pending.version,
      },
      pending.otpDigest
    );

    if (!ok) {
      const attempts = (pending.incorrectAttempts ?? 0) + 1;
      if (attempts >= EMAIL_OTP_MAX_ATTEMPTS) {
        const lockUntil = Date.now() + EMAIL_OTP_LOCK_MS;
        tx.update(pendingRef, {
          incorrectAttempts: attempts,
          status: "locked",
          lockUntil,
          otpDigest: null,
        });
        tx.update(userRef, {
          emailVerificationLockUntil: lockUntil,
          emailVerificationLockedEmail: pending.normalizedEmail,
          updatedAt: Date.now(),
        });
        throwEmailOtpError("EMAIL_OTP_LOCKED");
      }
      tx.update(pendingRef, { incorrectAttempts: attempts });
      throwEmailOtpError("EMAIL_OTP_INVALID");
    }

    await assertEmailNotBoundElsewhere(tx, db, pending.emailHash, input.uid);

    const userSnap = await tx.get(userRef);
    if (!userSnap.exists) throwEmailOtpError("FORBIDDEN", "permission-denied");
    const user = userSnap.data() as Record<string, unknown>;
    const now = Date.now();
    const bindingVersion = Number(user.emailBindingVersion ?? 0) + 1;
    const ueid = String(user.ueid ?? "");
    const previousEmail =
      user.emailStatus === "verified"
        ? normalizeEmailStrict(String(user.normalizedEmail ?? user.businessEmail ?? ""))
        : "";
    const replacingVerified = Boolean(
      previousEmail && previousEmail !== pending.normalizedEmail
    );
    if (replacingVerified) {
      const reviewGate = assertReviewContactEditAllowed({
        channel: "email",
        count: user.emailReviewChangeCount,
        profileCompletedAt:
          typeof user.profileCompletedAt === "number" ? user.profileCompletedAt : null,
      });
      if (!reviewGate.ok) throwEmailOtpError("EMAIL_REVIEW_EDIT_LIMIT");
    }

    const bindingRef = db.collection(EMAIL_BINDINGS).doc(pending.emailHash);
    const legacyRef = db.collection(EMAIL_INDEX).doc(pending.emailHash);

    if (replacingVerified) {
      const oldHash = emailBindingKey(previousEmail);
      if (oldHash !== pending.emailHash) {
        tx.delete(db.collection(EMAIL_BINDINGS).doc(oldHash));
        tx.delete(db.collection(EMAIL_INDEX).doc(oldHash));
      }
    }

    tx.set(bindingRef, {
      uid: input.uid,
      normalizedEmail: pending.normalizedEmail,
      status: "verified",
      boundAt: now,
      bindingVersion,
      updatedAt: now,
    });
    tx.set(legacyRef, {
      emailHash: pending.emailHash,
      userId: input.uid,
      ueid,
      status: "active",
      emailStatus: "verified",
      linkedAt: now,
      verifiedAt: now,
    });

    const countReview = shouldCountSuccessfulReviewContactReplacement({
      profileCompletedAt:
        typeof user.profileCompletedAt === "number" ? user.profileCompletedAt : null,
      previousNormalized: previousEmail,
      nextNormalized: pending.normalizedEmail,
      bindSucceeded: true,
    });
    const emailReviewChangeCount = countReview
      ? nextReviewContactEditCount(user.emailReviewChangeCount)
      : Number(user.emailReviewChangeCount ?? 0);

    const updated = {
      ...user,
      businessEmail: pending.normalizedEmail,
      normalizedEmail: pending.normalizedEmail,
      emailHash: pending.emailHash,
      emailStatus: "verified",
      emailLinkedAt: user.emailLinkedAt ?? now,
      emailVerifiedAt: now,
      emailBindingVersion: bindingVersion,
      identityUpdatedAt: now,
      emailVerificationLockUntil: null,
      emailVerificationLockedEmail: null,
      emailReviewChangeCount,
      updatedAt: now,
    };

    tx.update(userRef, {
      businessEmail: pending.normalizedEmail,
      normalizedEmail: pending.normalizedEmail,
      emailHash: pending.emailHash,
      emailStatus: "verified",
      emailLinkedAt: user.emailLinkedAt ?? now,
      emailVerifiedAt: now,
      emailBindingVersion: bindingVersion,
      identityUpdatedAt: now,
      emailVerificationLockUntil: null,
      emailVerificationLockedEmail: null,
      emailReviewChangeCount,
      updatedAt: now,
    });

    tx.update(pendingRef, {
      status: "consumed",
      consumedAt: now,
      otpDigest: null,
    });

    return { uid: input.uid, ...updated };
  });

  await writeSecurityEvent(db, input.uid, {
    type: "email_verified_bound",
    result: "success",
    challengeId: input.challengeId,
  });

  // Best-effort Auth email sync — app fields remain authoritative for routing.
  try {
    const { getAdminAuth } = await import("../admin");
    const email = String((profile as Record<string, unknown>).normalizedEmail ?? "");
    if (email) {
      await getAdminAuth().updateUser(input.uid, {
        email,
        emailVerified: true,
      });
    }
  } catch {
    // Native phone users may not support email update on Auth user — non-fatal.
  }

  return profile;
}

export async function resendEmailChallenge(input: {
  uid: string;
  challengeId: string;
}): Promise<{
  challengeId: string;
  maskedEmail: string;
  expiresAt: number;
  resendAvailableAt: number;
  version: number;
  sent: boolean;
  devCodeHint?: string;
}> {
  const db = getAdminDb();
  const pendingRef = db.collection(PENDING_COLLECTION).doc(input.challengeId);
  const snap = await pendingRef.get();
  if (!snap.exists) throwEmailOtpError("EMAIL_OTP_EXPIRED", "not-found");
  const pending = snap.data() as ChallengeDoc;
  if (pending.userId !== input.uid) throwEmailOtpError("FORBIDDEN", "permission-denied");
  if (pending.status !== "active") throwEmailOtpError("CONFLICT", "aborted");
  if (Date.now() < pending.resendAvailableAt) {
    throwEmailOtpError(
      "EMAIL_OTP_COOLDOWN",
      "resource-exhausted",
      cooldownDetails(pending.resendAvailableAt)
    );
  }
  return createOrRotateEmailChallenge({
    uid: input.uid,
    rawEmail: pending.normalizedEmail,
    purpose: pending.purpose,
  });
}

/** Exported for unit tests — transaction helper typing. */
export type { DocumentReference };
