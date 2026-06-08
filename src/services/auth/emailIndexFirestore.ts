import { deleteDoc, doc, getDoc, setDoc } from "firebase/firestore";

import { getFirebaseDb } from "@/config/firebase";
import type { EmailIndexEntry } from "@/domain/types";
import { createLogger } from "@/utils/logger";

const log = createLogger("auth/emailIndexFirestore");

export const EMAIL_INDEX_COLLECTION = "emailIndex";

/**
 * PRODUCTION BLOCKER: `emailIndex` is locked in firestore.rules. Client reads/writes
 * work in shared-dev/emulator; production must use Cloud Function + Admin SDK transaction.
 */
export async function lookupFirestoreEmailIndex(
  emailHash: string
): Promise<EmailIndexEntry | null> {
  try {
    const snap = await getDoc(doc(getFirebaseDb(), EMAIL_INDEX_COLLECTION, emailHash));
    if (!snap.exists()) return null;
    return snap.data() as EmailIndexEntry;
  } catch (e) {
    log.warn("lookupFirestoreEmailIndex failed", e);
    return null;
  }
}

export async function commitFirestoreEmailIndexOps(ops: {
  upsert?: EmailIndexEntry;
  removeHash?: string | null;
}): Promise<void> {
  const db = getFirebaseDb();
  try {
    if (ops.removeHash) {
      await deleteDoc(doc(db, EMAIL_INDEX_COLLECTION, ops.removeHash));
    }
    if (ops.upsert) {
      await setDoc(doc(db, EMAIL_INDEX_COLLECTION, ops.upsert.emailHash), ops.upsert);
    }
  } catch (e) {
    log.warn("commitFirestoreEmailIndexOps failed (may need Admin SDK)", e);
    throw e;
  }
}

export async function retireFirestoreEmailIndex(emailHash: string): Promise<void> {
  try {
    const ref = doc(getFirebaseDb(), EMAIL_INDEX_COLLECTION, emailHash);
    const snap = await getDoc(ref);
    if (!snap.exists()) return;
    const entry = snap.data() as EmailIndexEntry;
    await setDoc(ref, {
      ...entry,
      status: "deleted",
      emailStatus: "unverified",
      verifiedAt: null,
    });
  } catch (e) {
    log.warn("retireFirestoreEmailIndex failed", e);
  }
}
