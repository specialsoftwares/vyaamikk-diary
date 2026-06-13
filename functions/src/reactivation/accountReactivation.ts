import { HttpsError, onCall } from "firebase-functions/v2/https";
import { randomBytes } from "node:crypto";

import { getAdminDb } from "../admin";
import {
  applyLoginTimestamps,
  normalizePhoneE164,
  type UserProfileDoc,
} from "../identity/shared";

const USERS = "users";
const PHONE_INDEX = "phoneIndex";
const PENDING_COLLECTION = "pendingEmailVerifications";

const REACTIVATION_PHONE_TTL_MS = 10 * 60 * 1000;
const PENDING_TTL_MS = 20 * 60 * 1000;

function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

function hashEmail(normalized: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < normalized.length; i += 1) {
    hash ^= normalized.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function maskEmail(email: string): string {
  const v = email.trim();
  const at = v.indexOf("@");
  if (at <= 0) return "***";
  const local = v.slice(0, at);
  const domain = v.slice(at + 1);
  const maskedLocal = local.length <= 2 ? `${local[0] ?? "*"}***` : `${local.slice(0, 2)}***`;
  const dot = domain.indexOf(".");
  const maskedDomain =
    dot > 0 ? `${domain.slice(0, 1)}***${domain.slice(dot)}` : `${domain.slice(0, 2)}***`;
  return `${maskedLocal}@${maskedDomain}`;
}

function assertFreshPhoneVerification(profile: UserProfileDoc, now: number): number {
  const verifiedAt = profile.reactivationPhoneVerifiedAt ?? 0;
  if (!verifiedAt || now - verifiedAt > REACTIVATION_PHONE_TTL_MS) {
    throw new HttpsError(
      "failed-precondition",
      "Phone verification expired. Sign in with OTP again."
    );
  }
  return verifiedAt;
}

function assertEmailVerifiedForReactivation(profile: UserProfileDoc, reactivationRequestedAt: number): void {
  const emailVerifiedAt = profile.emailVerifiedAt ?? 0;
  const reactivationEmailVerifiedAt = profile.reactivationEmailVerifiedAt ?? 0;
  const emailOk =
    profile.emailStatus === "verified" &&
    (emailVerifiedAt >= reactivationRequestedAt || reactivationEmailVerifiedAt >= reactivationRequestedAt);
  if (!emailOk) {
    throw new HttpsError("failed-precondition", "Business email verification required.");
  }
}

/**
 * Start account reactivation after OTP sign-in on a pending-deletion account.
 * Sends email verification to the registered business email.
 */
export const startAccountReactivation = onCall({ region: "asia-south1" }, async (request) => {
  const authUid = request.auth?.uid;
  if (!authUid) throw new HttpsError("unauthenticated", "Sign in first.");

  const db = getAdminDb();
  const userRef = db.collection(USERS).doc(authUid);
  const userSnap = await userRef.get();
  if (!userSnap.exists) throw new HttpsError("not-found", "User not found.");

  const profile = userSnap.data() as UserProfileDoc;
  if (profile.status !== "pending_deletion") {
    throw new HttpsError("failed-precondition", "Account is not pending deletion.");
  }

  const phone = normalizePhoneE164(String(profile.phoneE164 ?? ""));
  const phoneSnap = await db.collection(PHONE_INDEX).doc(phone).get();
  if (!phoneSnap.exists || (phoneSnap.data() as { uid: string }).uid !== authUid) {
    throw new HttpsError("failed-precondition", "Mobile number does not match this account.");
  }

  const now = Date.now();
  const phoneVerifiedAt = assertFreshPhoneVerification(profile, now);

  const businessEmail = profile.businessEmail?.trim();
  if (!businessEmail) {
    throw new HttpsError("failed-precondition", "No registered business email on this account.");
  }

  const normalized = normalizeEmail(businessEmail);
  const emailHash = hashEmail(normalized);
  const verificationId = randomBytes(16).toString("hex");

  await db.runTransaction(async (tx) => {
    tx.update(userRef, {
      reactivationRequestedAt: now,
      reactivationPhoneVerifiedAt: phoneVerifiedAt,
      updatedAt: now,
    });
    tx.set(db.collection(PENDING_COLLECTION).doc(verificationId), {
      verificationId,
      userId: authUid,
      normalizedEmail: normalized,
      emailHash,
      createdAt: now,
      expiresAt: now + PENDING_TTL_MS,
      status: "pending",
      purpose: "reactivation",
      devCode: process.env.FUNCTIONS_EMULATOR === "true" ? "000000" : null,
    });
  });

  return {
    verificationId,
    maskedEmail: maskEmail(businessEmail),
    requiresEmailVerification: true as const,
  };
});

/**
 * Complete reactivation after registered business email is verified.
 * Restores account to active and clears deletion + reactivation fields.
 */
export const completeAccountReactivation = onCall({ region: "asia-south1" }, async (request) => {
  const authUid = request.auth?.uid;
  if (!authUid) throw new HttpsError("unauthenticated", "Sign in first.");

  const db = getAdminDb();
  const userRef = db.collection(USERS).doc(authUid);
  const now = Date.now();

  const result = await db.runTransaction(async (tx) => {
    const userSnap = await tx.get(userRef);
    if (!userSnap.exists) throw new HttpsError("not-found", "User not found.");

    const profile = userSnap.data() as UserProfileDoc;
    if (profile.status !== "pending_deletion") {
      throw new HttpsError("failed-precondition", "Account is not pending deletion.");
    }

    const reactivationRequestedAt = profile.reactivationRequestedAt ?? 0;
    if (!reactivationRequestedAt) {
      throw new HttpsError("failed-precondition", "Reactivation not started.");
    }

    assertFreshPhoneVerification(profile, now);
    assertEmailVerifiedForReactivation(profile, reactivationRequestedAt);

    const loggedIn = applyLoginTimestamps(profile, now);
    tx.update(userRef, {
      status: "active",
      deletionRequestedAt: null,
      deletionScheduledFor: null,
      deletionCompletedAt: null,
      reactivationRequestedAt: null,
      reactivationPhoneVerifiedAt: null,
      reactivationEmailVerifiedAt: now,
      lastLoginAt: loggedIn.lastLoginAt,
      previousLoginAt: loggedIn.previousLoginAt,
      lastActiveAt: loggedIn.lastActiveAt,
      updatedAt: now,
    });

    return {
      ...loggedIn,
      status: "active" as const,
      deletionRequestedAt: null,
      deletionScheduledFor: null,
      deletionCompletedAt: null,
      reactivationRequestedAt: null,
      reactivationPhoneVerifiedAt: null,
      reactivationEmailVerifiedAt: now,
    };
  });

  return { profile: result, isNewUser: false as const };
});
