/**
 * Staged verified-email change.
 * The mobile factor is a fresh phone ID token for this account and its current number.
 */

import { FieldValue } from "firebase-admin/firestore";
import { createHash } from "node:crypto";

import { getAdminDb } from "../admin";
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
  phoneProofId,
  PHONE_FACTOR_PROOFS,
  readPhoneProofClaims,
} from "../identity/phoneFactorProof";
const CHANGE_SESSIONS = "emailChangeSessions";

function assertOperationId(value: string): void {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(value)) throwEmailOtpError("CONFLICT", "aborted");
}

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
  emailChallengeId?: string;
  phoneProofId?: string;
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
  // Authentication is still verified on every retry. Freshness governs acquiring
  // a new operation; it must not strand an already-created, unexpired operation
  // solely because its successful response was lost.
  if (!claims || claims.uid !== input.uid || claims.projectId !== projectId ||
      claims.signInProvider !== "phone" || !claims.phoneNumber ||
      claims.authTimeSeconds == null || !Number.isFinite(claims.authTimeSeconds) ||
      claims.authTimeSeconds * 1000 > now + 60_000) {
    throwEmailOtpError("FORBIDDEN", "permission-denied");
  }
  const factorId = phoneProofId({
    projectId, authUid: claims.uid, phoneE164: claims.phoneNumber,
    authTimeSeconds: claims.authTimeSeconds, purpose: "current_phone_reauth",
  });
  const db = getAdminDb();
  const userRef = db.collection(USERS).doc(input.uid);
  // This endpoint has no destination payload: one verified phone proof acquires
  // exactly one email-change operation. A refreshed token with the same auth_time
  // retrieves that operation rather than creating another one.
  const changeSessionId = createHash("sha256").update(`email-change|${input.uid}|${factorId}`).digest("hex");
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
    if (claims.phoneNumber !== expectedPhone) throwEmailOtpError("FORBIDDEN", "permission-denied");
    const hash = String(user.emailHash ?? "");
    const bindingSnap = /^[a-f0-9]{64}$/.test(hash) ? await tx.get(db.collection(EMAIL_BINDINGS).doc(hash)) : null;
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
    const proofRef = db.collection(PHONE_FACTOR_PROOFS).doc(factorId);
    const [proofSnap, priorSessionSnap] = await Promise.all([tx.get(proofRef), tx.get(sessionRef)]);
    if (proofSnap.exists) {
      const consumed = proofSnap.data()!;
      const prior = priorSessionSnap.data() as ChangeSession | undefined;
      if (consumed.uid !== input.uid || consumed.purpose !== "current_phone_reauth" ||
          consumed.changeSessionId !== changeSessionId || consumed.phoneE164 !== expectedPhone ||
          !prior || prior.uid !== input.uid || prior.phoneProofId !== factorId ||
          !["mobile_ok", "awaiting_new_email"].includes(prior.status) || prior.expiresAt <= now ||
          prior.oldEmailHash !== mailbox.emailHash || prior.mailboxVersion !== mailbox.bindingVersion) {
        throwEmailOtpError("FORBIDDEN", "permission-denied");
      }
      return { changeSessionId, expiresAt: prior.expiresAt };
    }
    if (priorSessionSnap.exists) throwEmailOtpError("CONFLICT", "aborted");
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
      phoneProofId: proof.proofId,
    };
    tx.set(proofRef, {
      uid: input.uid,
      purpose: "current_phone_reauth",
      phoneE164: expectedPhone,
      consumedAt: now,
      changeSessionId,
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
  assertOperationId(input.changeSessionId);
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
    idempotencyKey: input.idempotencyKey ?? `email-change:${input.changeSessionId}:${normalizeEmailStrict(input.newEmail)}`,
    changeSessionId: input.changeSessionId,
  });

  return { ...challenge, changeSessionId: input.changeSessionId };
}

export async function completeEmailChangeTransaction(input: {
  uid: string;
  changeSessionId: string;
  emailChallengeId: string;
  emailCode: string;
}): Promise<{ profile: Record<string, unknown> }> {
  assertOperationId(input.changeSessionId);
  assertOperationId(input.emailChallengeId);
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
    if (session.emailChallengeId !== input.emailChallengeId ||
        pending.changeSessionId !== input.changeSessionId ||
        pending.normalizedEmail !== session.newEmail || pending.emailHash !== session.newEmailHash) {
      throwEmailOtpError("CONFLICT", "aborted");
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
    if ((pending.lockUntil && pending.lockUntil > Date.now()) || pending.status === "locked") {
      throwEmailOtpError("EMAIL_OTP_LOCKED");
    }
    if (pending.purpose !== "change_new" || pending.status !== "active") {
      throwEmailOtpError("CONFLICT", "aborted");
    }
    if (!/^[a-f0-9]{64}$/.test(session.oldEmailHash ?? "")) throwEmailOtpError("CONFLICT", "aborted");
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
