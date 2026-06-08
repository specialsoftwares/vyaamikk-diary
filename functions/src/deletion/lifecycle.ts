import { HttpsError, onCall } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";

import { getAdminDb } from "../admin";
import { normalizePhoneE164 } from "../identity/shared";

const USERS = "users";
const PHONE_INDEX = "phoneIndex";
const UEID_INDEX = "ueidIndex";
const EMAIL_INDEX = "emailIndex";
const RETIRED_PHONES = "retiredPhones";

const DELETION_GRACE_MS = 15 * 24 * 60 * 60 * 1000;

const USER_SUBCOLLECTIONS = [
  "entries",
  "professionalPacks",
  "letterheadDocs",
  "customerCreditRecords",
  "purchaseOrders",
  "config",
  "counters",
  "_saveLocks",
  "trustedDevices",
] as const;

async function purgeUserSubcollections(uid: string): Promise<void> {
  const db = getAdminDb();
  for (const sub of USER_SUBCOLLECTIONS) {
    const snap = await db.collection(USERS).doc(uid).collection(sub).limit(500).get();
    if (snap.empty) continue;
    const batch = db.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
}

async function executeRetireIdentity(authUid: string): Promise<void> {
  const db = getAdminDb();
  const userRef = db.collection(USERS).doc(authUid);
  const userSnap = await userRef.get();
  if (!userSnap.exists) return;

  const user = userSnap.data() as Record<string, unknown>;
  const phone = normalizePhoneE164(String(user.phoneE164 ?? ""));
  const ueid = String(user.ueid ?? "");
  const emailHash = typeof user.emailHash === "string" ? user.emailHash : null;
  const now = Date.now();

  await db.runTransaction(async (tx) => {
    tx.update(userRef, {
      status: "deleted",
      deletedAt: now,
      deletionCompletedAt: now,
      retiredUeid: true,
      updatedAt: now,
    });
    if (phone) {
      tx.delete(db.collection(PHONE_INDEX).doc(phone));
      tx.set(db.collection(RETIRED_PHONES).doc(phone), {
        phoneE164: phone,
        retiredUeid: ueid,
        uid: authUid,
        deletedAt: now,
        status: "deleted",
      });
    }
    if (ueid) {
      tx.set(
        db.collection(UEID_INDEX).doc(ueid),
        { uid: authUid, status: "retired", retired: true, retiredAt: now },
        { merge: true }
      );
    }
    if (emailHash) {
      tx.set(
        db.collection(EMAIL_INDEX).doc(emailHash),
        { status: "deleted", emailStatus: "unverified", verifiedAt: null },
        { merge: true }
      );
    }
  });

  await purgeUserSubcollections(authUid);
}

/**
 * Retire identity indexes and mark user deleted — Admin SDK only.
 */
export const retireIdentity = onCall({ region: "asia-south1" }, async (request) => {
  const authUid = request.auth?.uid;
  if (!authUid) throw new HttpsError("unauthenticated", "Sign in first.");

  const db = getAdminDb();
  const userSnap = await db.collection(USERS).doc(authUid).get();
  if (!userSnap.exists) throw new HttpsError("not-found", "User not found.");

  await executeRetireIdentity(authUid);
  return { ok: true };
});

/** Final account deletion after grace — callable from app or cron. */
export const completeAccountDeletion = onCall({ region: "asia-south1" }, async (request) => {
  const authUid = request.auth?.uid;
  if (!authUid) throw new HttpsError("unauthenticated", "Sign in first.");

  const db = getAdminDb();
  const userRef = db.collection(USERS).doc(authUid);
  const userSnap = await userRef.get();
  if (!userSnap.exists) return { ok: true, detail: "already_gone" };

  const user = userSnap.data() as Record<string, unknown>;
  const status = String(user.status ?? "active");
  if (status === "pending_deletion") {
    const scheduled =
      Number(user.deletionScheduledFor ?? 0) ||
      Number(user.deletionRequestedAt ?? 0) + DELETION_GRACE_MS;
    if (scheduled > Date.now()) {
      throw new HttpsError("failed-precondition", "Deletion grace period has not elapsed.");
    }
  } else if (status !== "deleted") {
    throw new HttpsError("failed-precondition", "Account is not pending deletion.");
  }

  await executeRetireIdentity(authUid);
  return { ok: true };
});

/** Daily sweep — finalize pending deletions whose grace has elapsed. */
export const scheduledDeletionCleanup = onSchedule(
  { schedule: "every 24 hours", region: "asia-south1" },
  async () => {
    const db = getAdminDb();
    const now = Date.now();
    const snap = await db
      .collection(USERS)
      .where("status", "==", "pending_deletion")
      .limit(100)
      .get();

    for (const doc of snap.docs) {
      const data = doc.data();
      const scheduled =
        Number(data.deletionScheduledFor ?? 0) ||
        Number(data.deletionRequestedAt ?? 0) + DELETION_GRACE_MS;
      if (scheduled > now) continue;
      try {
        await purgeUserSubcollections(doc.id);
        await db.runTransaction(async (tx) => {
          const phone = normalizePhoneE164(String(data.phoneE164 ?? ""));
          const ueid = String(data.ueid ?? "");
          tx.update(doc.ref, {
            status: "deleted",
            deletedAt: now,
            deletionCompletedAt: now,
            retiredUeid: true,
            updatedAt: now,
          });
          if (phone) {
            tx.delete(db.collection(PHONE_INDEX).doc(phone));
            tx.set(db.collection(RETIRED_PHONES).doc(phone), {
              phoneE164: phone,
              retiredUeid: ueid,
              uid: doc.id,
              deletedAt: now,
              status: "deleted",
            });
          }
          if (ueid) {
            tx.set(
              db.collection(UEID_INDEX).doc(ueid),
              { uid: doc.id, status: "retired", retired: true, retiredAt: now },
              { merge: true }
            );
          }
        });
      } catch {
        // continue sweep
      }
    }
  }
);
