/**
 * Mobile-safe GRIN server transport.
 *
 * Implements GrinServerCommandPort with the Firebase JS httpsCallable client.
 * Not live deploy. Does not import firebase-admin, tools/goods-evidence-emulator,
 * tools/goods-evidence-storage, better-sqlite3, HostSqlite, or node:fs.
 *
 * Client digest is local freeze identity only. Client uid is never server
 * identity. If currentAuth.uid !== outbox ownerUid, refuse without calling.
 */

export const GRIN_REGISTER_CALLABLE = "grinRegisterGoodsReceipt";
export const GRIN_RECONCILE_CALLABLE = "grinReconcileCommand";
export const GRIN_MUTATE_CALLABLE = "grinMutateGoodsReceipt";
export const GRIN_READ_CALLABLE = "grinReadGoodsReceipt";
export const GRIN_UPLOAD_EVIDENCE_CALLABLE = "grinUploadEvidence";

export type GrinHttpsCallablePayload = {
  envelope: unknown;
  digest?: string;
};

export type GrinHttpsReconcilePayload = {
  ledgerId: string;
  commandId: string;
};

export type GrinHttpsReadPayload = {
  ledgerId: string;
  receiptId: string;
};

export type GrinHttpsEvidencePayload = {
  ledgerId: string;
  receiptId: string;
  evidenceId: string;
  role: string;
  claimedSha256: string | null;
  category: unknown;
  sizeBytes: number;
};
