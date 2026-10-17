/**
 * Reusable GRIN cleanup lists for account deletion.
 *
 * THREE DISTINCT FACTS (do not collapse):
 * 1. Implemented grace: functions/src/deletion/finalPurge.ts
 *    DELETION_GRACE_MS = 45 days (SUPERSEDES 15; not 180). After this
 *    cancellation window, non-GRIN data is actually deleted (Play: freeze
 *    ≠ delete). GRIN omitted until INCLUDE_GRIN_IN_ACCOUNT_PURGE.
 * 2. Owner-requested 180-day hold: SUPERSEDED for this clock; not implemented.
 * 3. Policy ultimately approved for public operation: UNRESOLVED. Do not advertise.
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

/**
 * Nested collection ids that GRIN writes under the user trees.
 * Recursion must visit these even if listSubcollections is incomplete,
 * otherwise a parent delete can strand children.
 */
export const GRIN_KNOWN_NESTED_COLLECTION_IDS = [
  "receipts",
  "commands",
  "serials",
  "evidenceObjects",
  "events",
  "evidenceLinks",
  "evidenceControl",
] as const;

export type GrinDeletionInventoryEntry = {
  kind: "storage_prefix" | "firestore_root" | "firestore_nested" | "reservation_or_temp";
  path: string;
  notes: string;
};

/** SOURCE inventory. Not an operational deletion service. Flag stays false. */
export function describeGrinDeletionInventory(uid: string): GrinDeletionInventoryEntry[] {
  const id = uid.trim() || "{uid}";
  const ledger = `users/${id}/goodsEvidenceLedgers/{ledgerId}`;
  const receipt = `${ledger}/receipts/{receiptId}`;
  return [
    {
      kind: "storage_prefix",
      path: grinEvidenceStoragePrefix(id),
      notes: "originals at …/{objectKey}/original and derivatives at …/{objectKey}/derivatives/{derivativeKey}",
    },
    {
      kind: "firestore_root",
      path: `users/${id}/goodsEvidenceLedgers`,
      notes: "ledgers; nested receipts, commands, serials, evidenceObjects",
    },
    {
      kind: "firestore_nested",
      path: `${ledger}/receipts`,
      notes: "issued receipts",
    },
    {
      kind: "firestore_nested",
      path: `${ledger}/commands`,
      notes: "register/mutate command docs",
    },
    {
      kind: "firestore_nested",
      path: `${ledger}/serials`,
      notes: "FY serial tokens",
    },
    {
      kind: "firestore_nested",
      path: `${ledger}/evidenceObjects`,
      notes: "evidence reservations and retained originals metadata",
    },
    {
      kind: "firestore_nested",
      path: `${receipt}/events`,
      notes: "receipt event history",
    },
    {
      kind: "firestore_nested",
      path: `${receipt}/evidenceLinks`,
      notes: "verified evidence pointers",
    },
    {
      kind: "firestore_nested",
      path: `${receipt}/evidenceControl`,
      notes: "per-receipt original id control / temps",
    },
    {
      kind: "reservation_or_temp",
      path: `users/${id}/goodsEvidenceAdmission/runtime`,
      notes: "admission policy runtime",
    },
    {
      kind: "reservation_or_temp",
      path: `users/${id}/goodsEvidenceUploadControl/runtime`,
      notes: "in-flight upload reservations",
    },
    {
      kind: "reservation_or_temp",
      path: `users/${id}/grinEvidenceObjectKeys/{objectKey}`,
      notes: "object-key reservation bindings",
    },
    {
      kind: "reservation_or_temp",
      path: `users/${id}/grinEvidenceDerivativeKeys/{derivativeKey}`,
      notes: "derivative reservation bindings",
    },
    {
      kind: "firestore_root",
      path: `users/${id}/goodsEvidenceStorage/accounting`,
      notes: "per-account storage accounting + holds map",
    },
  ];
}
