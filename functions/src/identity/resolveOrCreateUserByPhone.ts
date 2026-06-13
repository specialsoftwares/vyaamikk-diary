import { HttpsError, onCall } from "firebase-functions/v2/https";
import type { Transaction } from "firebase-admin/firestore";

import { getAdminDb } from "../admin";
import {
  applyLoginTimestamps,
  freshProfileShell,
  generateUEID,
  normalizePhoneE164,
  type UserProfileDoc,
} from "./shared";

const USERS = "users";
const PHONE_INDEX = "phoneIndex";
const UEID_INDEX = "ueidIndex";
const RETIRED_PHONES = "retiredPhones";

const DELETION_GRACE_MS = 15 * 24 * 60 * 60 * 1000;

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

function minimalSafeProfile(p: UserProfileDoc): Pick<
  UserProfileDoc,
  "uid" | "status" | "deletionScheduledFor" | "phoneE164"
> {
  return {
    uid: p.uid,
    status: p.status,
    deletionScheduledFor: p.deletionScheduledFor,
    phoneE164: p.phoneE164,
  };
}

function isPendingDeletion(p: UserProfileDoc): boolean {
  return p.status === "pending_deletion";
}

function isActive(p: UserProfileDoc): boolean {
  return p.status === "active";
}

function deletionBlocked(p: UserProfileDoc): boolean {
  if (p.status === "deleted") return true;
  if (p.status !== "pending_deletion") return false;
  const scheduled = p.deletionScheduledFor ?? (p.deletionRequestedAt ?? 0) + DELETION_GRACE_MS;
  return scheduled > Date.now();
}

async function allocateUeid(tx: Transaction, authUid: string): Promise<string> {
  const db = getAdminDb();
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const candidate = generateUEID();
    const ueidRef = db.collection(UEID_INDEX).doc(candidate);
    const ueidSnap = await tx.get(ueidRef);
    if (!ueidSnap.exists) {
      tx.set(ueidRef, { uid: authUid, status: "active", createdAt: Date.now() });
      return candidate;
    }
    const data = ueidSnap.data() as { retired?: boolean; status?: string };
    if (data.retired === true || data.status === "retired") continue;
  }
  throw new HttpsError("resource-exhausted", "Could not allocate a unique Vyaamikk ID.");
}

export const resolveOrCreateUserByPhone = onCall(
  { region: "asia-south1" },
  async (request) => {
    const authUid = request.auth?.uid;
    if (!authUid) {
      throw new HttpsError("unauthenticated", "Sign in with phone OTP first.");
    }

    const rawPhone = request.data?.phoneE164;
    if (typeof rawPhone !== "string" || !rawPhone.trim()) {
      throw new HttpsError("invalid-argument", "phoneE164 is required.");
    }

    const phone = normalizePhoneE164(rawPhone);
    const db = getAdminDb();

    const result = await db.runTransaction(async (tx) => {
      const phoneRef = db.collection(PHONE_INDEX).doc(phone);
      const phoneSnap = await tx.get(phoneRef);
      const userRef = db.collection(USERS).doc(authUid);
      const now = Date.now();

      if (phoneSnap.exists) {
        const { uid } = phoneSnap.data() as { uid: string };
        if (uid !== authUid) {
          throw new HttpsError(
            "failed-precondition",
            "This mobile number is linked to another account."
          );
        }
        const existingSnap = await tx.get(userRef);
        if (!existingSnap.exists) {
          throw new HttpsError("failed-precondition", "Identity registry is inconsistent.");
        }
        const profile = existingSnap.data() as UserProfileDoc;
        if (deletionBlocked(profile)) {
          const scheduled =
            profile.deletionScheduledFor ??
            (profile.deletionRequestedAt ?? 0) + DELETION_GRACE_MS;
          const maskedEmail = profile.businessEmail?.trim()
            ? maskEmail(profile.businessEmail)
            : null;
          tx.update(userRef, {
            reactivationPhoneVerifiedAt: now,
            updatedAt: now,
          });
          return {
            status: "deletion_pending" as const,
            requiresReactivation: true as const,
            requiresEmailVerification: true as const,
            maskedEmail,
            deletionScheduledFor: scheduled,
            policyTextVersion: "2026-06" as const,
            profile: minimalSafeProfile(profile),
            isNewUser: false as const,
          };
        }
        if (!isActive(profile) && !isPendingDeletion(profile)) {
          throw new HttpsError(
            "permission-denied",
            "This account was deleted. Sign in again to create a new account."
          );
        }
        const loggedIn = applyLoginTimestamps(profile, now);
        tx.update(userRef, {
          lastLoginAt: loggedIn.lastLoginAt,
          previousLoginAt: loggedIn.previousLoginAt,
          lastActiveAt: loggedIn.lastActiveAt,
          updatedAt: loggedIn.updatedAt,
        });
        return { profile: loggedIn, isNewUser: false };
      }

      const retiredSnap = await tx.get(db.collection(RETIRED_PHONES).doc(phone));
      const retired = retiredSnap.exists;

      const existingUser = await tx.get(userRef);
      if (existingUser.exists) {
        const prior = existingUser.data() as UserProfileDoc;
        if (isActive(prior)) {
          if (normalizePhoneE164(prior.phoneE164) !== phone) {
            throw new HttpsError(
              "failed-precondition",
              "Account mobile mismatch. Contact support."
            );
          }
        }
        if (!isActive(prior)) {
          const freshUeid = await allocateUeid(tx, authUid);
          const fresh = freshProfileShell(authUid, phone, freshUeid, now);
          tx.set(userRef, fresh);
          tx.set(phoneRef, { uid: authUid, createdAt: now });
          return { profile: fresh, isNewUser: true };
        }
      }

      const ueid = await allocateUeid(tx, authUid);
      if (retired) {
        // Fresh UEID on retired phone — policy allows re-registration.
      }
      const profile = freshProfileShell(authUid, phone, ueid, now);
      tx.set(userRef, profile);
      tx.set(phoneRef, { uid: authUid, createdAt: now });
      return { profile, isNewUser: true };
    });

    return result;
  }
);

/** Alias for documentation — same implementation. */
export const claimMobile = resolveOrCreateUserByPhone;
