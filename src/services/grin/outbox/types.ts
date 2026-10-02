import type { ChunkHasher, Wave1OriginalCategory } from "@/goodsEvidence/evidence";
import type { GrinCommandType, LocalReceiptRecord, OutboxLocalState } from "@/goodsEvidence/ports";

export type { GrinCommandType, LocalReceiptRecord, OutboxLocalState, Wave1OriginalCategory };

/** Host sqlite execution labels. Keep this union here so G1 typecheck does not load node:fs. */
export type SqliteExecutionLabel = "SQLITE_HOST" | "NATIVE_DEVICE" | "MAP_STANDIN";

export type GrinDispatchSession = {
  ownerUid: string;
  dispatchGeneration: number;
};

export type LocalEvidenceRole = "original" | "thumbnail" | "metadata";

export type LocalEvidenceUploadState =
  | "local_only"
  | "uploading"
  | "uploaded_derivative"
  | "uploaded_unverified"
  | "verified"
  | "failed_retryable";

export type GrinLocalEvidenceFile = {
  ownerUid: string;
  ledgerId: string;
  receiptId: string;
  evidenceId: string;
  role: LocalEvidenceRole;
  localPath: string;
  claimedSha256: string | null;
  byteSize: number | null;
  /** Wave 1 original category; null for derivatives and unrepaired rows. */
  category: Wave1OriginalCategory | null;
  uploadState: LocalEvidenceUploadState;
  originalDurable: boolean;
  retainLocal: boolean;
  /** Trusted descriptor; null on old rows and non-durable originals. */
  actualSha256: string | null;
  mime: string | null;
  verifiedSizeBytes: number | null;
  storagePath: string | null;
  /** Storage object generation. Never the literal `"verified"`. */
  objectGeneration: string | null;
  reservationId: string | null;
  captureProvenance: string | null;
  /** Capture claim. Never inferred as false for missing rows. */
  osConversionOccurred: boolean | "unknown";
  claimedMime: string | null;
};

export type ActionableFailure =
  | "retry_when_online"
  | "sign_in_again"
  | "account_or_ledger_not_usable"
  | "feature_not_admitted"
  | "fix_command_payload"
  | "command_payload_mismatch"
  | "receipt_already_registered"
  | "server_serial_integrity"
  | "serial_range_exhausted"
  | "retry_exhausted"
  | "unsync_evidence_retained"
  | "deletion_policy_unresolved";

export type GrinQueuedCommand = {
  ownerUid: string;
  ledgerId: string;
  commandId: string;
  receiptId: string;
  commandType: GrinCommandType;
  digest: string;
  frozenPayload: unknown;
  localState: OutboxLocalState;
  attemptCount: number;
  maxAttempts: number;
  lastErrorCode: string | null;
  lastErrorActionable: ActionableFailure | null;
  leaseWorkerId: string | null;
  leaseGeneration: number | null;
  leaseUntilMs: number | null;
  leaseAttemptId: string | null;
  dispatchGeneration: number;
};

export type GrinLocalReceiptView = LocalReceiptRecord & {
  commandType: GrinCommandType | null;
  lastErrorCode: string | null;
  lastErrorActionable: ActionableFailure | null;
  attemptCount: number;
};

export type OutboxCrashPhase = "after_receipt" | "after_command" | "after_dispatching";

/**
 * Local original bytes may be released only after the server has verified the
 * original object at a storage generation (hash match). Thumbnail or metadata
 * upload success is not a durable-upload condition and must not delete the original.
 */
export const DURABLE_ORIGINAL_UPLOAD_CONDITION =
  "Local original bytes may be released only after the server has verified the original object at a storage generation (hash match). Thumbnail or metadata upload success is not a durable-upload condition and must not delete the original.";

export const MAX_DISPATCH_ATTEMPTS = 5;
export const DEFAULT_LEASE_TTL_MS = 30_000;

export { MAX_CONCURRENT_UPLOADS_PER_OWNER } from "@/goodsEvidence/evidence";

/** Host SQLite reopen is not native process-death acceptance. */
export const SQLITE_HOST_NOT_NATIVE_DEVICE =
  "SQLITE_HOST tests are not NATIVE_DEVICE process-death proof.";

export const APP_FILESYSTEM = "APP_FILESYSTEM" as const;
export type HasherExecutionLabel = SqliteExecutionLabel | typeof APP_FILESYSTEM;

/**
 * Injected chunk hasher for retained local originals.
 * SQLITE_HOST uses node fs chunks at HASH_CHUNK_BYTES. That is not NATIVE_DEVICE.
 * Production persistGrinOwnerSession uses APP_FILESYSTEM (Expo FileSystem).
 */
export type GrinLocalOriginalHasher = {
  executionLabel: HasherExecutionLabel;
  createHasher: () => ChunkHasher;
  chunksForPath: (localPath: string) => AsyncIterable<Uint8Array> | Iterable<Uint8Array>;
};
