import { HttpsError, onCall } from "firebase-functions/v2/https";
import { logger } from "firebase-functions";
import type { Transaction } from "firebase-admin/firestore";
import { createHash } from "node:crypto";

import { getAdminDb } from "../admin";
import {
  assertMobileNotQuarantined,
  applyDeferredMobileQuarantineRelease,
  sha256MobileHash,
} from "./mobileQuarantine";
import {
  phoneAuthBindingSafeMeta,
  resolveAuthoritativePhoneAuthIdentity,
} from "./phoneAuthClaimBinding";
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

function uidSuffix(uid: string): string {
  return uid.length >= 6 ? uid.slice(-6) : "??????";
}

function correlationId(): string {
  return `id_${Date.now().toString(36)}_${createHash("sha256")
    .update(`${Date.now()}:${Math.random()}`)
    .digest("hex")
    .slice(0, 10)}`;
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

/**
 * READ-ONLY: find an unused UEID. Must run before any write in the transaction.
 */
async function findAvailableUeid(tx: Transaction): Promise<string> {
  const db = getAdminDb();
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const candidate = generateUEID();
    const ueidSnap = await tx.get(db.collection(UEID_INDEX).doc(candidate));
    if (!ueidSnap.exists) return candidate;
    const data = ueidSnap.data() as { retired?: boolean; status?: string } | undefined;
    if (data?.retired === true || data?.status === "retired") continue;
  }
  throw new HttpsError("resource-exhausted", "Could not allocate a unique Vyaamikk ID.");
}

/** WRITE-PHASE: claim a previously read-available UEID. */
function claimUeid(tx: Transaction, ueid: string, authUid: string, now: number): void {
  tx.set(getAdminDb().collection(UEID_INDEX).doc(ueid), {
    uid: authUid,
    status: "active",
    createdAt: now,
  });
}

function rethrowAsHttps(err: unknown, attemptId: string, authUid: string): never {
  if (err instanceof HttpsError) throw err;
  const message = err instanceof Error ? err.message : String(err);
  const name = err instanceof Error ? err.name : "Error";
  logger.error("resolveOrCreateUserByPhone unexpected", {
    attemptId,
    uidSuffix: uidSuffix(authUid),
    errorName: name,
    // Never log phones/tokens. Keep message redacted of E.164-looking digits runs.
    errorMessage: message.replace(/\+\d{10,15}/g, "+[redacted]").slice(0, 300),
  });
  throw new HttpsError(
    "internal",
    "Account setup failed unexpectedly. Please try again.",
    { attemptId, diagnosticCode: "IDENTITY_TX_UNEXPECTED" }
  );
}

export const resolveOrCreateUserByPhone = onCall(
  { region: "asia-south1" },
  async (request) => {
    const attemptId = correlationId();

    // ——— PHONE-CLAIM BINDING (before any identity mutation) ———
    // Client phoneE164 is asserted against Firebase Auth token.phone_number;
    // the authenticated claim is the authoritative phone for all writes below.
    const bound = resolveAuthoritativePhoneAuthIdentity({
      authUid: request.auth?.uid,
      tokenPhoneNumber: request.auth?.token?.phone_number,
      clientPhoneE164: request.data?.phoneE164,
    });
    const authUid = bound.authUid;
    const phone = bound.phoneE164;

    const mobileHash = sha256MobileHash(phone);
    const db = getAdminDb();
    const claimMeta = phoneAuthBindingSafeMeta({
      authUid,
      tokenPhoneNumber: request.auth?.token?.phone_number,
    });

    logger.info("resolveOrCreateUserByPhone start", {
      attemptId,
      uidSuffix: uidSuffix(authUid),
      mobileHashPrefix: mobileHash.slice(0, 8),
      phase: "identity_tx_start",
      authUidPresent: claimMeta.authUidPresent,
      tokenPhonePresent: claimMeta.tokenPhonePresent,
      tokenPhoneSuffix: claimMeta.tokenPhoneSuffix,
    });

    try {
      const result = await db.runTransaction(async (tx) => {
        const phoneRef = db.collection(PHONE_INDEX).doc(phone);
        const userRef = db.collection(USERS).doc(authUid);
        const now = Date.now();

        // ——— READ PHASE (no writes) ———
        const phoneSnap = await tx.get(phoneRef);
        const quarantine = await assertMobileNotQuarantined(tx, mobileHash, now);

        if (phoneSnap.exists) {
          const phoneData = phoneSnap.data() as { uid?: string } | undefined;
          const indexedUid = typeof phoneData?.uid === "string" ? phoneData.uid : "";
          if (!indexedUid) {
            throw new HttpsError("failed-precondition", "Identity registry is inconsistent.");
          }
          if (indexedUid !== authUid) {
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

          // ——— WRITE PHASE ———
          applyDeferredMobileQuarantineRelease(tx, mobileHash, now, quarantine.releaseDue);

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
              _meta: { branch: "returning_deletion_pending" as const },
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
          return {
            profile: loggedIn,
            isNewUser: false as const,
            _meta: { branch: "returning_active" as const },
          };
        }

        // First-time / re-register path — finish remaining reads before any write.
        const retiredSnap = await tx.get(db.collection(RETIRED_PHONES).doc(phone));
        const retired = retiredSnap.exists;
        const existingUser = await tx.get(userRef);

        if (existingUser.exists) {
          const prior = existingUser.data() as UserProfileDoc;
          if (isActive(prior)) {
            let priorPhone = "";
            try {
              priorPhone =
                typeof prior.phoneE164 === "string" ? normalizePhoneE164(prior.phoneE164) : "";
            } catch {
              priorPhone = "";
            }
            if (priorPhone !== phone) {
              throw new HttpsError(
                "failed-precondition",
                "Account mobile mismatch. Contact support."
              );
            }
            // Active user missing phoneIndex — repair index (reads done).
            applyDeferredMobileQuarantineRelease(tx, mobileHash, now, quarantine.releaseDue);
            const loggedIn = applyLoginTimestamps(prior, now);
            tx.update(userRef, {
              lastLoginAt: loggedIn.lastLoginAt,
              previousLoginAt: loggedIn.previousLoginAt,
              lastActiveAt: loggedIn.lastActiveAt,
              updatedAt: loggedIn.updatedAt,
            });
            tx.set(phoneRef, { uid: authUid, createdAt: now }, { merge: true });
            return {
              profile: loggedIn,
              isNewUser: false as const,
              _meta: { branch: "repair_phone_index" as const },
            };
          }
          // Inactive / deleted user doc for this authUid — recreate under same uid.
          const freshUeid = await findAvailableUeid(tx);
          applyDeferredMobileQuarantineRelease(tx, mobileHash, now, quarantine.releaseDue);
          claimUeid(tx, freshUeid, authUid, now);
          const fresh = freshProfileShell(authUid, phone, freshUeid, now);
          tx.set(userRef, fresh);
          tx.set(phoneRef, { uid: authUid, createdAt: now });
          return {
            profile: fresh,
            isNewUser: true as const,
            _meta: { branch: "recreate_inactive_user" as const, retired },
          };
        }

        const ueid = await findAvailableUeid(tx);
        applyDeferredMobileQuarantineRelease(tx, mobileHash, now, quarantine.releaseDue);
        claimUeid(tx, ueid, authUid, now);
        const profile = freshProfileShell(authUid, phone, ueid, now);
        tx.set(userRef, profile);
        tx.set(phoneRef, { uid: authUid, createdAt: now });
        return {
          profile,
          isNewUser: true as const,
          _meta: { branch: "first_time_create" as const, retired },
        };
      });

      const meta = (result as { _meta?: { branch?: string; retired?: boolean } })._meta;
      logger.info("resolveOrCreateUserByPhone ok", {
        attemptId,
        uidSuffix: uidSuffix(authUid),
        branch: meta?.branch ?? "unknown",
        isNewUser: Boolean((result as { isNewUser?: boolean }).isNewUser),
        retiredPhone: Boolean(meta?.retired),
      });

      // Strip internal meta before returning to clients.
      if (result && typeof result === "object" && "_meta" in result) {
        const { _meta: _ignored, ...publicResult } = result as Record<string, unknown>;
        return publicResult;
      }
      return result;
    } catch (err) {
      rethrowAsHttps(err, attemptId, authUid);
    }
  }
);

/** Alias for documentation — same implementation. */
export const claimMobile = resolveOrCreateUserByPhone;
