/**
 * Staged verified-email change.
 * The mobile factor is a fresh phone ID token for this account and its current number.
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
import { EMAIL_OTP_LOCK_MS, EMAIL_OTP_MAX_ATTEMPTS, normalizeEmailStrict } from "./otpPolicy";
import { resolveVerifiedMailbox } from "./verifiedMailbox";
import { normalizePhoneE164 } from "../identity/shared";
import {
  assessPhoneProof,
  phoneProofProjectId,
  PHONE_FACTOR_PROOFS,
  readPhoneProofClaims,
} from "../identity/phoneFactorProof";
const CHANGE_SESSIONS = "emailChangeSessions";

interface ChangeSession {
  changeSessionId: string;
  uid: string;
  status: "awaiting_mobile" | "mobile_ok" | "awaiting_new_email" | "completed" | "cancelled";
  mobileFactorAt: number | null;
  oldEmail: string;
  oldEmailHash: string;
  mailboxVersion: number;
  newEmail: string | null;
  newEmailHash: string | null;
  expiresAt: number;
  createdAt: number;
}

/**
 * Current-phone reauthentication. The proof is a fresh phone ID token for this
 * account and its current number. A challenge id, a code length, or a client timestamp is not proof.
 */
export async function startEmailChangeRequireMobile(input: {
  uid: string;
  phoneProofToken: string;
  nowMs?: number;
  projectId?: string;
}): Promise<{ changeSessionId: string; expiresAt: number }> {
  const now = input.nowMs ?? Date.now();
  const projectId = input.projectId || phoneProofProjectId();
  const claims = await readPhoneProofClaims(input.phoneProofToken ?? "");
  const db = getAdminDb();
  const userRef = db.collection(USERS).doc(input.uid);
  const changeSessionId = randomBytes(16).toString("hex");
  const sessionRef = db.collection(CHANGE_SESSIONS).doc(changeSessionId);

  return db.runTransaction(async (tx) => {
    const userSnap = await tx.get(userRef);
    if (!userSnap.exists) throwEmailOtpError("FORBIDDEN", "permission-denied");
    const user = userSnap.data() as Record<string, unknown>;
    if (Number(user.coolingOffUntil ?? 0) > now) throwEmailOtpError("FORBIDDEN", "permission-denied");
    let expectedPhone = "";
    try {
      expectedPhone = normalizePhoneE164(String(user.phoneE164 ?? ""));
    } catch {
      throwEmailOtpError("FORBIDDEN", "permission-denied");
    }
    const hash = String(user.emailHash ?? "");
    const bindingSnap = hash ? await tx.get(db.collection(EMAIL_BINDINGS).doc(hash)) : null;
    const mailbox = resolveVerifiedMailbox(
      {
        uid: input.uid,
        emailStatus: user.emailStatus,
        normalizedEmail: user.normalizedEmail,
        emailHash: user.emailHash,
        emailBindingVersion: user.emailBindingVersion,
      },
      bindingSnap?.exists ? (bindingSnap.data() as Record<string, unknown>) : null
    );
    if (!mailbox.ok) {
      throwEmailOtpError(mailbox.outcome === "verification_required" ? "EMAIL_VERIFICATION_REQUIRED" : "CONFLICT", mailbox.outcome === "verification_required" ? "failed-precondition" : "aborted");
    }
    const proof = assessPhoneProof({
      claims,
      purpose: "current_phone_reauth",
      accountUid: input.uid,
      expectedPhoneE164: expectedPhone,
      nowMs: now,
      projectId,
      alreadyConsumed: false,
    });
    if (!proof.ok) throwEmailOtpError("FORBIDDEN", "permission-denied");
    const proofRef = db.collection(PHONE_FACTOR_PROOFS).doc(proof.proofId);
    const proofSnap = await tx.get(proofRef);
    if (proofSnap.exists) throwEmailOtpError("FORBIDDEN", "permission-denied");

    const session: ChangeSession = {
      changeSessionId,
      uid: input.uid,
      status: "mobile_ok",
      mobileFactorAt: now,
      oldEmail: mailbox.normalizedEmail,
      oldEmailHash: mailbox.emailHash,
      mailboxVersion: mailbox.bindingVersion,
      newEmail: null,
      newEmailHash: null,
      expiresAt: now + 30 * 60 * 1000,
      createdAt: now,
    };
    tx.set(proofRef, {
      uid: input.uid,
      purpose: "current_phone_reauth",
      phoneE164: expectedPhone,
      consumedAt: now,
    });
    tx.set(sessionRef, session);
    return { changeSessionId, expiresAt: session.expiresAt };
  });
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

  const outcome = await db.runTransaction(async (tx) => {
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
      return { kind: "profile" as const, profile: { uid: input.uid, ...user } };
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
    if (pending.lockUntil && pending.lockUntil > Date.now()) {
      throwEmailOtpError("EMAIL_OTP_LOCKED");
    }
    const bindingSnap = await tx.get(db.collection(EMAIL_BINDINGS).doc(session.oldEmailHash));
    const mailbox = resolveVerifiedMailbox(
      {
        uid: input.uid,
        emailStatus: user.emailStatus,
        normalizedEmail: user.normalizedEmail,
        emailHash: user.emailHash,
        emailBindingVersion: user.emailBindingVersion,
      },
      bindingSnap.exists ? (bindingSnap.data() as Record<string, unknown>) : null
    );
    if (
      !mailbox.ok ||
      mailbox.bindingVersion !== session.mailboxVersion ||
      mailbox.normalizedEmail !== session.oldEmail ||
      mailbox.emailHash !== session.oldEmailHash
    ) {
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
        return {
          kind: "error" as const,
          errorCode: "EMAIL_OTP_LOCKED" as const,
          httpsCode: "failed-precondition" as const,
        };
      }
      tx.update(pendingRef, { incorrectAttempts: attempts });
      return {
        kind: "error" as const,
        errorCode: "EMAIL_OTP_INVALID" as const,
        httpsCode: "failed-precondition" as const,
      };
    }

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

    return { kind: "profile" as const, profile: { uid: input.uid, ...updated } };
  });

  if (outcome.kind === "error") {
    throwEmailOtpError(outcome.errorCode, outcome.httpsCode);
  }
  const profile = outcome.profile;

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
