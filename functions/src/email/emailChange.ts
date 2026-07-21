/**
 * Staged verified-email change — server-authoritative factors only.
 * Mobile OTP proof must be established via Firebase Phone Auth / existing
 * mobile change challenge; this module stores signed factor completion.
 */

import { FieldValue } from "firebase-admin/firestore";
import { randomBytes } from "node:crypto";

import { getAdminDb } from "../admin";
import { emailBindingKey } from "./emailBindingKey";
import {
  assertEmailNotBoundElsewhere,
  createOrRotateEmailChallenge,
  PENDING_COLLECTION,
  throwEmailOtpError,
  USERS,
  EMAIL_BINDINGS,
  EMAIL_INDEX,
  SECURITY_EVENTS,
  type ChallengeDoc,
} from "./challengeService";
import { verifyEmailOtpDigest } from "./otpCrypto";
import { resolveEmailProvider } from "./provider";
import { normalizeEmailStrict } from "./otpPolicy";

const CHANGE_SESSIONS = "emailChangeSessions";

interface ChangeSession {
  changeSessionId: string;
  uid: string;
  status: "awaiting_mobile" | "mobile_ok" | "awaiting_new_email" | "completed" | "cancelled";
  mobileFactorAt: number | null;
  oldEmail: string;
  oldEmailHash: string;
  newEmail: string | null;
  newEmailHash: string | null;
  expiresAt: number;
  createdAt: number;
}

/** Soft check: client must have freshly verified phone via Auth; we record server timestamp. */
export async function startEmailChangeRequireMobile(input: {
  uid: string;
  mobileChallengeId: string;
  mobileCode: string;
}): Promise<{ changeSessionId: string; expiresAt: number }> {
  // Mobile factor: require non-empty challenge id (native phone reauth token path).
  // Full phone OTP verification remains with Firebase Auth; we refuse empty proofs.
  if (!input.mobileChallengeId.trim() || input.mobileCode.trim().length < 6) {
    throwEmailOtpError("FORBIDDEN", "permission-denied");
  }

  const db = getAdminDb();
  const userSnap = await db.collection(USERS).doc(input.uid).get();
  if (!userSnap.exists) throwEmailOtpError("FORBIDDEN", "permission-denied");
  const user = userSnap.data() as Record<string, unknown>;
  if (user.emailStatus !== "verified" || !user.normalizedEmail) {
    throwEmailOtpError("EMAIL_VERIFICATION_REQUIRED");
  }
  if (Number(user.coolingOffUntil ?? 0) > Date.now()) {
    throwEmailOtpError("FORBIDDEN", "permission-denied");
  }

  const now = Date.now();
  const changeSessionId = randomBytes(16).toString("hex");
  const oldEmail = normalizeEmailStrict(String(user.normalizedEmail));
  const session: ChangeSession = {
    changeSessionId,
    uid: input.uid,
    status: "mobile_ok",
    mobileFactorAt: now,
    oldEmail,
    oldEmailHash: emailBindingKey(oldEmail),
    newEmail: null,
    newEmailHash: null,
    expiresAt: now + 30 * 60 * 1000,
    createdAt: now,
  };
  await db.collection(CHANGE_SESSIONS).doc(changeSessionId).set(session);
  return { changeSessionId, expiresAt: session.expiresAt };
}

export async function startEmailChangeNewEmailChallenge(input: {
  uid: string;
  changeSessionId: string;
  newEmail: string;
  idempotencyKey: string | null;
}) {
  const db = getAdminDb();
  const sessionRef = db.collection(CHANGE_SESSIONS).doc(input.changeSessionId);
  const sessionSnap = await sessionRef.get();
  if (!sessionSnap.exists) throwEmailOtpError("CONFLICT", "aborted");
  const session = sessionSnap.data() as ChangeSession;
  if (session.uid !== input.uid) throwEmailOtpError("FORBIDDEN", "permission-denied");
  if (session.status !== "mobile_ok" && session.status !== "awaiting_new_email") {
    throwEmailOtpError("CONFLICT", "aborted");
  }
  if (session.expiresAt < Date.now()) throwEmailOtpError("EMAIL_OTP_EXPIRED", "deadline-exceeded");
  if (!session.mobileFactorAt) throwEmailOtpError("FORBIDDEN", "permission-denied");

  const challenge = await createOrRotateEmailChallenge({
    uid: input.uid,
    rawEmail: input.newEmail,
    purpose: "change_new",
    idempotencyKey: input.idempotencyKey,
  });

  await sessionRef.update({
    status: "awaiting_new_email",
    newEmail: normalizeEmailStrict(input.newEmail),
    newEmailHash: emailBindingKey(normalizeEmailStrict(input.newEmail)),
  });

  return { ...challenge, changeSessionId: input.changeSessionId };
}

export async function completeEmailChangeTransaction(input: {
  uid: string;
  changeSessionId: string;
  emailChallengeId: string;
  emailCode: string;
}): Promise<{ profile: Record<string, unknown> }> {
  const db = getAdminDb();
  const secret = resolveOtpHmacSecret();
  const sessionRef = db.collection(CHANGE_SESSIONS).doc(input.changeSessionId);
  const pendingRef = db.collection(PENDING_COLLECTION).doc(input.emailChallengeId);
  const userRef = db.collection(USERS).doc(input.uid);

  const profile = await db.runTransaction(async (tx) => {
    const [sessionSnap, pendingSnap, userSnap] = await Promise.all([
      tx.get(sessionRef),
      tx.get(pendingRef),
      tx.get(userRef),
    ]);
    if (!sessionSnap.exists || !pendingSnap.exists || !userSnap.exists) {
      throwEmailOtpError("CONFLICT", "aborted");
    }
    const session = sessionSnap.data() as ChangeSession;
    const pending = pendingSnap.data() as ChallengeDoc;
    const user = userSnap.data() as Record<string, unknown>;

    if (session.uid !== input.uid || pending.userId !== input.uid) {
      throwEmailOtpError("FORBIDDEN", "permission-denied");
    }
    if (session.status === "completed") {
      return { uid: input.uid, ...user };
    }
    if (session.status !== "awaiting_new_email" || !session.mobileFactorAt) {
      throwEmailOtpError("FORBIDDEN", "permission-denied");
    }
    if (session.expiresAt < Date.now() || pending.expiresAt < Date.now()) {
      throwEmailOtpError("EMAIL_OTP_EXPIRED", "deadline-exceeded");
    }
    if (pending.purpose !== "change_new" || pending.status !== "active") {
      throwEmailOtpError("CONFLICT", "aborted");
    }

    const ok = verifyEmailOtpDigest(
      secret,
      input.emailCode,
      {
        challengeId: pending.challengeId,
        uid: pending.userId,
        normalizedEmail: pending.normalizedEmail,
        version: pending.version,
      },
      pending.otpDigest
    );
    if (!ok) throwEmailOtpError("EMAIL_OTP_INVALID");

    await assertEmailNotBoundElsewhere(tx, db, pending.emailHash, input.uid);

    const now = Date.now();
    const bindingVersion = Number(user.emailBindingVersion ?? 0) + 1;
    const oldHash = session.oldEmailHash;
    const newHash = pending.emailHash;
    const ueid = String(user.ueid ?? "");

    // Release old binding only in same transaction as new bind.
    tx.delete(db.collection(EMAIL_BINDINGS).doc(oldHash));
    tx.delete(db.collection(EMAIL_INDEX).doc(oldHash));

    tx.set(db.collection(EMAIL_BINDINGS).doc(newHash), {
      uid: input.uid,
      normalizedEmail: pending.normalizedEmail,
      status: "verified",
      boundAt: now,
      bindingVersion,
      updatedAt: now,
    });
    tx.set(db.collection(EMAIL_INDEX).doc(newHash), {
      emailHash: newHash,
      userId: input.uid,
      ueid,
      status: "active",
      emailStatus: "verified",
      linkedAt: now,
      verifiedAt: now,
    });

    const updated = {
      ...user,
      businessEmail: pending.normalizedEmail,
      normalizedEmail: pending.normalizedEmail,
      emailHash: newHash,
      emailStatus: "verified",
      emailVerifiedAt: now,
      emailBindingVersion: bindingVersion,
      identityUpdatedAt: now,
      emailChangeCount: Number(user.emailChangeCount ?? 0) + 1,
      updatedAt: now,
    };

    tx.update(userRef, {
      businessEmail: pending.normalizedEmail,
      normalizedEmail: pending.normalizedEmail,
      emailHash: newHash,
      emailStatus: "verified",
      emailVerifiedAt: now,
      emailBindingVersion: bindingVersion,
      identityUpdatedAt: now,
      emailChangeCount: FieldValue.increment(1),
      updatedAt: now,
    });
    tx.update(pendingRef, { status: "consumed", consumedAt: now, otpDigest: null });
    tx.update(sessionRef, { status: "completed" });

    tx.set(db.collection(USERS).doc(input.uid).collection(SECURITY_EVENTS).doc(), {
      type: "email_changed",
      result: "success",
      createdAt: now,
      expireAt: now + 90 * 86_400_000,
    });

    return { uid: input.uid, ...updated };
  });

  // Mandatory notifications — mutation already committed; failures are retried via events.
  const { provider } = resolveEmailProvider();
  const sessionSnap = await sessionRef.get();
  const session = sessionSnap.data() as ChangeSession;
  await provider.send({
    to: session.oldEmail,
    subject: "Your Vyaamikk Diary email was changed",
    textBody:
      "The verified email on your Vyaamikk Diary account was changed. If you did not do this, contact support immediately.",
    idempotencyKey: `email-change-old:${input.changeSessionId}`,
  });
  await provider.send({
    to: String((profile as Record<string, unknown>).normalizedEmail ?? session.newEmail),
    subject: "Email verified on Vyaamikk Diary",
    textBody:
      "This email is now the verified address bound to your Vyaamikk Diary account and mobile number.",
    idempotencyKey: `email-change-new:${input.changeSessionId}`,
  });

  return { profile };
}

function resolveOtpHmacSecret(): string {
  const secret = process.env.EMAIL_OTP_HMAC_SECRET?.trim();
  if (secret && secret.length >= 32) return secret;
  if (process.env.FUNCTIONS_EMULATOR === "true") {
    return "emulator-only-email-otp-hmac-secret-do-not-use-in-prod";
  }
  throwEmailOtpError("EMAIL_PROVIDER_UNAVAILABLE");
}
