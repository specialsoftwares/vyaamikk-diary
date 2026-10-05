/**
 * Reusable GRIN cleanup lists for account deletion.
 *
 * THREE DISTINCT FACTS (do not collapse):
 * 1. Implemented grace: functions/src/deletion/finalPurge.ts
 *    DELETION_GRACE_MS = 15 days.
 * 2. Owner-requested policy window: 180 days (NOT legally / Play approved).
 * 3. Policy ultimately approved for public operation: UNRESOLVED.
 *
 * INCLUDE_GRIN_IN_ACCOUNT_PURGE defaults false so existing
 * scheduledDeletionCleanup / runFinalAccountPurge MUST NOT purge live
 * customer GRIN until a coordinator+owner flips the flag.
 */

export const INCLUDE_GRIN_IN_ACCOUNT_PURGE = false;

/** Storage prefix segment under users/{uid}/ — originals and derivatives. */
export const GRIN_EVIDENCE_STORAGE_CATEGORY = "grinEvidence" as const;

/**
 * Top-level Firestore collections under users/{uid}/ that hold GRIN trees.
 * Nested receipts/events/commands live under goodsEvidenceLedgers.
 */
export const GRIN_FIRESTORE_USER_COLLECTIONS = [
  "goodsEvidenceLedgers",
  "goodsEvidenceAdmission",
  "goodsEvidenceUploadControl",
  "grinEvidenceObjectKeys",
  "grinEvidenceDerivativeKeys",
  "goodsEvidenceStorage",
] as const;

export type GrinFirestoreUserCollection = (typeof GRIN_FIRESTORE_USER_COLLECTIONS)[number];

export function grinEvidenceStoragePrefix(uid: string): string {
  const safe = uid.trim();
  if (!safe) throw new Error("uid required for storage root");
  return `users/${safe}/${GRIN_EVIDENCE_STORAGE_CATEGORY}/`;
}

export function allGrinStoragePrefixes(uid: string): string[] {
  return [grinEvidenceStoragePrefix(uid)];
}

export function allGrinFirestoreCollectionIds(): readonly GrinFirestoreUserCollection[] {
  return GRIN_FIRESTORE_USER_COLLECTIONS;
}
