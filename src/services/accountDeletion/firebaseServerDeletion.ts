/**
 * Best-effort client-side Firestore erasure.
 *
 * PRODUCTION BLOCKER: Full recursive deletion and index cleanup should run
 * via Cloud Functions / Admin SDK with elevated privileges. Client SDK may be
 * blocked by security rules on `phoneIndex`, `ueidIndex`, and bulk deletes.
 */

import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  query,
  setDoc,
  updateDoc,
  writeBatch,
} from "firebase/firestore";

import { getFirebaseDb } from "@/config/firebase";
import { getActiveBackend } from "@/config/env";
import type { ServerDeletionOutcome } from "@/domain/accountDeletion";
import type { PhoneE164, UEID, UserProfile } from "@/domain/types";
import { callCompleteAccountDeletion } from "@/services/auth/identityCallable";
import { createLogger } from "@/utils/logger";

import { recordRetiredPhoneFirestore } from "./retiredIdentity";
import { retireFirestoreEmailIndex } from "@/services/auth/emailIndexFirestore";

const log = createLogger("accountDeletion/firebase");

const USERS = "users";
const PHONE_INDEX = "phoneIndex";
const UEID_INDEX = "ueidIndex";
const DELETION_REQUESTS = "deletionRequests";

const SUBCOLLECTIONS = [
  "entries",
  "professionalPacks",
  "letterheadDocs",
  "purchaseOrders",
  "customerCreditRecords",
] as const;

async function deleteQueryBatch(
  colRef: ReturnType<typeof collection>,
  batchSize = 400
): Promise<{ deleted: number; maybeMore: boolean }> {
  const snap = await getDocs(query(colRef, limit(batchSize)));
  if (snap.empty) return { deleted: 0, maybeMore: false };

  const db = getFirebaseDb();
  const batch = writeBatch(db);
  snap.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();
  return { deleted: snap.size, maybeMore: snap.size >= batchSize };
}

async function purgeUserSubcollections(uid: string): Promise<boolean> {
  const db = getFirebaseDb();
  let allOk = true;

  for (const name of SUBCOLLECTIONS) {
    const colRef = collection(db, USERS, uid, name);
    let loops = 0;
    while (loops < 50) {
      loops += 1;
      try {
        const { maybeMore } = await deleteQueryBatch(colRef);
        if (!maybeMore) break;
      } catch (e) {
        log.warn("subcollection delete failed", { name, e });
        allOk = false;
        break;
      }
    }
  }

  try {
    await deleteDoc(doc(db, USERS, uid, "config", "letterhead"));
  } catch {
    // optional doc
  }

  for (const counter of ["purchaseOrder", "customerCredit"]) {
    try {
      await deleteDoc(doc(db, USERS, uid, "counters", counter));
    } catch {
      // optional doc
    }
  }

  return allOk;
}

function anonymizedUserPatch(profile: UserProfile, now: number) {
  return {
    displayName: null,
    businessName: null,
    workType: null,
    businessEmail: null,
    normalizedEmail: null,
    emailHash: null,
    emailStatus: null,
    emailLinkedAt: null,
    emailVerifiedAt: null,
    profileLogo: null,
    status: "deleted" as const,
    deletedAt: now,
    deletionRequestedAt: profile.deletionRequestedAt ?? now,
    deletionScheduledFor: null,
    deletionCompletedAt: now,
    retiredUeid: true,
    updatedAt: now,
  };
}

export async function executeFirebaseServerDeletion(
  profile: UserProfile
): Promise<ServerDeletionOutcome> {
  const backend = getActiveBackend();

  if (backend === "firebase-production") {
    try {
      const result = await callCompleteAccountDeletion(profile.uid);
      if (result.ok) {
        return "completed";
      }
    } catch (e) {
      log.warn("Cloud Function completeAccountDeletion failed — falling back to client purge", e);
    }
  }

  const db = getFirebaseDb();
  const now = Date.now();
  const uid = profile.uid;
  const phone = profile.phoneE164 as PhoneE164;
  const ueid = profile.ueid as UEID;

  let subcollectionsOk = true;
  try {
    subcollectionsOk = await purgeUserSubcollections(uid);
  } catch (e) {
    log.warn("purge subcollections", e);
    subcollectionsOk = false;
  }

  try {
    await updateDoc(doc(db, USERS, uid), anonymizedUserPatch(profile, now));
  } catch (e) {
    log.warn("anonymize user doc", e);
  }

  try {
    await deleteDoc(doc(db, PHONE_INDEX, phone));
  } catch (e) {
    log.warn("delete phoneIndex (may need Admin SDK)", e);
  }

  if (profile.emailHash) {
    try {
      await retireFirestoreEmailIndex(profile.emailHash);
    } catch (e) {
      log.warn("retire emailIndex (may need Admin SDK)", e);
    }
  }

  try {
    await setDoc(
      doc(db, UEID_INDEX, ueid),
      { uid, retired: true, retiredAt: now, status: "retired" },
      { merge: true }
    );
  } catch (e) {
    log.warn("retire ueidIndex", e);
  }

  await recordRetiredPhoneFirestore(phone, ueid, uid);

  const serverStatus: ServerDeletionOutcome = subcollectionsOk ? "completed" : "pending";

  try {
    await setDoc(doc(db, DELETION_REQUESTS, uid), {
      uid,
      phoneE164: phone,
      retiredUeid: ueid,
      status: serverStatus === "completed" ? "completed" : "pending",
      requestedAt: now,
      completedAt: serverStatus === "completed" ? now : null,
      clientNote:
        serverStatus === "completed"
          ? "Client best-effort deletion finished."
          : "Subcollections may remain — requires Cloud Function / Admin SDK.",
      updatedAt: now,
    });
  } catch (e) {
    log.warn("deletionRequests write", e);
    return "failed";
  }

  return serverStatus;
}
