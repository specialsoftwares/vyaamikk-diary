/**
 * Shared GRIN ports for G1–G5. Coordinator-owned.
 * Implementation lives in team-owned files; this module is types and
 * documented state machines only. Not a production callable.
 *
 * Schema: GOODS_EVIDENCE_SCHEMA_VERSION = 1.
 */

export const GRIN_CONTRACT_REVISION = "2026-10-01.wave1" as const;

/** ID charset: [A-Za-z0-9_-], length 1–64. commandId 8–128. Never rewritten. */
export type GrinId = string;

export type CommandIdentity = {
  ownerUid: string;
  ledgerId: string;
  commandId: string;
};

export type ReceiptIdentity = {
  ownerUid: string;
  ledgerId: string;
  receiptId: string;
};

export type EvidenceIdentity = {
  ownerUid: string;
  ledgerId: string;
  evidenceId: string;
};

/**
 * Adapter deny codes. Domain CommandAdmission uses a subset
 * (invalid, digest_conflict, receipt_exists, version_conflict, voided, disabled).
 * Adapter maps auth/policy/integrity separately. No pending-deletion replay exception.
 */
export type GrinDenyCode =
  | "unauthenticated"
  | "forbidden"
  | "policy_denied"
  | "not_found"
  | "invalid"
  | "digest_conflict"
  | "receipt_exists"
  | "integrity"
  | "serial_exhausted"
  | "version_conflict"
  | "voided";

export type GrinRegisterSuccess = {
  ok: true;
  replayed: boolean;
  receiptId: string;
  issuedNumber: string;
  serial: number;
  /** Server-authoritative registration instant (ISO-8601 UTC). Not reported arrival. */
  serverRegisteredAtUtc: string;
  eventVersion: number;
  headHash: string;
};

export type GrinMutationSuccess = {
  ok: true;
  replayed: boolean;
  receiptId: string;
  eventId: string;
  eventVersion: number;
  headHash: string;
  /** Attempt clock at the successful commit attempt; not firestoreCommitTime. */
  serverAcceptedAtUtc: string;
};

export type GrinDeny = { ok: false; code: GrinDenyCode; detail: string };

export type GrinRegisterResult = GrinRegisterSuccess | GrinDeny;
export type GrinMutationResult = GrinMutationSuccess | GrinDeny;

export type GrinCommandType =
  | "registerGoodsReceipt"
  | "amendFields"
  | "recordQc"
  | "dispatchReturn"
  | "correctReturnDispatch"
  | "voidWithReason"
  | "recordEwbObservation"
  | "linkVerifiedEvidence";

/**
 * Canonicalization: sorted keys, UTF-8 JSON, explicit nulls, omitted undefined
 * object properties, rejected undefined/sparse array slots, schema canon v1.
 * firestoreCommitTime is excluded from hashes. Clone caller input; never mutate it.
 */
export type CanonicalizationNotes = {
  omitUndefinedObjectProperties: true;
  rejectUndefinedArrayEntries: true;
  rejectSparseArrays: true;
  firestoreCommitTimeExcludedFromHash: true;
};

export type EvidenceObjectState =
  | "reserved"
  | "uploading"
  | "uploaded_unverified"
  | "verified"
  | "rejected"
  | "linked"
  | "orphan_pending_review";

/**
 * Permitted transitions (retry stays in the same state unless noted):
 * reserved → uploading | rejected
 * uploading → uploaded_unverified | reserved (client retry) | rejected
 * uploaded_unverified → verified | rejected | orphan_pending_review
 * verified → linked | rejected (replacement must not inherit prior verification)
 * rejected → (terminal for this object id; new object id required)
 * linked → (terminal for this object id)
 * orphan_pending_review → verified | rejected | linked (after recovery)
 */
export const EVIDENCE_STATE_TRANSITIONS: Record<EvidenceObjectState, readonly EvidenceObjectState[]> = {
  reserved: ["uploading", "rejected"],
  uploading: ["uploaded_unverified", "reserved", "rejected"],
  uploaded_unverified: ["verified", "rejected", "orphan_pending_review"],
  verified: ["linked", "rejected"],
  rejected: [],
  linked: [],
  orphan_pending_review: ["verified", "rejected", "linked"],
};

/** Client hash is a claim. Trusted verification hashes stored bytes at a generation. */
export type VerifiedEvidenceResult = {
  evidenceId: string;
  ownerUid: string;
  ledgerId: string;
  receiptId: string;
  category: string;
  mime: string;
  byteSize: number;
  rawSha256: string;
  storagePath: string;
  generation: string;
  verifiedAtUtc: string;
};

export type OutboxLocalState =
  | "draft"
  | "queued"
  | "dispatching"
  | "issued"
  | "attachment_pending"
  | "conflicted"
  | "failed_retryable"
  | "failed_permanent";

export type LocalReceiptRecord = {
  ownerUid: string;
  ledgerId: string;
  receiptId: string;
  commandId: string;
  digest: string;
  localState: OutboxLocalState;
  issuedNumber: string | null;
  serverRegisteredAtUtc: string | null;
  dispatchGeneration: number;
};

export type PackCompletenessLabel = "complete" | "incomplete";
