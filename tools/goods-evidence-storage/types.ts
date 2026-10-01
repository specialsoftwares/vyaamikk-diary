/**
 * G2 evidence storage ports. Injected by tests. Not firebase-admin.
 * Not a production callable.
 */

import type { EvidenceObjectState, VerifiedEvidenceResult } from "../../src/goodsEvidence/ports";

export type G2DenyCode =
  | "unauthenticated"
  | "forbidden"
  | "policy_denied"
  | "not_found"
  | "invalid"
  | "integrity";

export type G2Deny = { ok: false; code: G2DenyCode; detail: string };

export type TrustedCaller = {
  uid: string | null;
};

export type G2Clock = {
  nowMs: () => number;
  objectKey: () => string;
};

export type G2DocSnap = {
  readonly exists: boolean;
  data(): Record<string, unknown> | undefined;
};

export type G2DocRef = {
  readonly path: string;
};

export type G2Transaction = {
  get(ref: G2DocRef): Promise<G2DocSnap>;
  set(ref: G2DocRef, data: Record<string, unknown>): void;
};

export type G2Firestore = {
  doc(path: string): G2DocRef;
  runTransaction<T>(
    fn: (tx: G2Transaction) => Promise<T>,
    options?: { maxAttempts?: number }
  ): Promise<T>;
};

export type G2BlobStat = {
  generation: string;
  byteSize: number;
  contentType: string;
};

export type G2BlobPutResult =
  | { ok: true; generation: string; byteSize: number; contentType: string }
  | { ok: false; code: "already_exists" };

export type G2BlobRead = G2BlobStat & {
  chunks: AsyncIterable<Uint8Array>;
};

export type G2BlobStore = {
  putIfAbsent(path: string, bytes: Uint8Array, contentType: string): Promise<G2BlobPutResult>;
  stat(path: string): Promise<G2BlobStat | null>;
  open(path: string): Promise<G2BlobRead | null>;
};

export type AdmissionPolicy = {
  schemaVersion: 1;
  newCommands: "allow" | "deny";
  reconciliation: "allow" | "deny";
};

export type EvidenceRecord = {
  schemaVersion: 1;
  evidenceId: string;
  ownerUid: string;
  ledgerId: string;
  receiptId: string;
  category: string;
  mime: string;
  objectKey: string;
  storagePath: string;
  kind: "original";
  state: EvidenceObjectState;
  claimedSha256: string;
  claimedByteSize: number;
  actualSha256: string | null;
  actualByteSize: number | null;
  generation: string | null;
  verifiedAtUtc: string | null;
  linkedAtUtc: string | null;
  originalFileName: string | null;
  reservationFingerprint: string;
  verifiedResult: VerifiedEvidenceResult | null;
  createdAtUtc: string;
  updatedAtUtc: string;
};

export type G2ReserveSuccess = {
  ok: true;
  replayed: boolean;
  evidenceId: string;
  objectKey: string;
  storagePath: string;
  state: "reserved" | "uploading";
};

export type G2LifecycleSuccess = {
  ok: true;
  replayed: boolean;
  evidenceId: string;
  state: EvidenceObjectState;
  verified: VerifiedEvidenceResult | null;
};

export type G2ReserveResult = G2ReserveSuccess | G2Deny;
export type G2LifecycleResult = G2LifecycleSuccess | G2Deny;

export type G2Hooks = {
  afterReads?: (attempt: number) => Promise<void> | void;
};
