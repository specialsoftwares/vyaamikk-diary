import { doc, runTransaction, type DocumentSnapshot, type Firestore } from "firebase/firestore";

import { AppError } from "@/domain/errors";
import { istMonthKeyForMillis } from "@/billing/istMonthKey";
import {
  readUsageSnapshot,
  type BillableRecordCollection,
} from "@/billing/optionC/usageTransition";
import { wrapAtomicCreateFailure } from "@/billing/optionC/classifyCreateError";
import {
  monthlyRecordCapFromStatusData,
  quotaEnforcementEnabledFromStatusData,
  UNLIMITED_MONTHLY_RECORD_CAP,
} from "@/subscription/monthlyRecordCap";

export interface RecoveredExistingRecord<T> {
  outcome: "existing";
  record: T;
  serial: null;
}

/**
 * Provenance of a recovery snapshot.
 *
 * `transaction` means the document was read via `Transaction.get` in a
 * read-only recovery transaction (SDK server lookup, one consistent view).
 * `untrusted` is anything else, including ordinary `getDoc` (may be cache).
 */
export type RecoveryProvenance = "transaction" | "untrusted";

export interface RecoverySnapshot {
  exists: boolean;
  id: string;
  data: Record<string, unknown> | undefined;
  metadata: { fromCache: boolean; hasPendingWrites: boolean };
  provenance: RecoveryProvenance;
}

export interface AuthoritativeRecoveryState {
  account: RecoverySnapshot;
  record: RecoverySnapshot;
  status: RecoverySnapshot;
  usage: RecoverySnapshot;
}

export type RecoveryStateReader = () => Promise<AuthoritativeRecoveryState>;

function isCommittedServerSnapshot(snap: RecoverySnapshot): boolean {
  if (snap.metadata.hasPendingWrites) return false;
  if (snap.provenance === "transaction") return true;
  return !snap.metadata.fromCache;
}

function recoveryStateIsAuthoritative(state: AuthoritativeRecoveryState): boolean {
  return (
    isCommittedServerSnapshot(state.account) &&
    isCommittedServerSnapshot(state.record) &&
    isCommittedServerSnapshot(state.status) &&
    isCommittedServerSnapshot(state.usage)
  );
}

function snapshotFromTx(snap: DocumentSnapshot): RecoverySnapshot {
  return {
    exists: snap.exists(),
    id: snap.id,
    data: snap.exists() ? (snap.data() as Record<string, unknown>) : undefined,
    metadata: {
      fromCache: snap.metadata.fromCache,
      hasPendingWrites: snap.metadata.hasPendingWrites,
    },
    provenance: "transaction",
  };
}

/**
 * One read-only transaction: account, record, status, usage.
 * `tx.get` is the SDK server-lookup contract; this is not `getDoc`.
 */
export async function readRecoveryStateInTransaction(
  db: Firestore,
  userId: string,
  collection: BillableRecordCollection,
  recordId: string
): Promise<AuthoritativeRecoveryState> {
  return runTransaction(db, async (tx) => {
    const account = await tx.get(doc(db, "users", userId));
    const record = await tx.get(doc(db, "users", userId, collection, recordId));
    const status = await tx.get(doc(db, "users", userId, "subscription", "status"));
    const usage = await tx.get(doc(db, "users", userId, "subscription", "usageCurrent"));
    return {
      account: snapshotFromTx(account),
      record: snapshotFromTx(record),
      status: snapshotFromTx(status),
      usage: snapshotFromTx(usage),
    };
  });
}

export interface RecoverAfterPermissionDeniedParams<T> {
  recordId: string;
  /** Month key the failed create attempted to write. */
  monthKey: string;
  /**
   * Client clock captured with `monthKey`. Comparing them is a client-value
   * consistency check, not proof of server time. Rules use `request.time`.
   */
  nowMs: number;
  parseExisting: (id: string, data: Record<string, unknown>) => T;
  cause: unknown;
  wrapped: AppError;
  readAuthoritative: RecoveryStateReader;
  /**
   * Quota-exempt creates must never be reinterpreted as quota_exhausted.
   * Existing-record replay still applies.
   */
  quotaConsumption?: "required" | "none";
}

/**
 * Bounded, read-only recovery after Rules reject a create commit.
 *
 * Success / quota_exhausted only from a coherent server-confirmed snapshot
 * of account + record + status + usage. Cache, pending writes, failed reads,
 * inactive accounts, and wrong-month attempts stay controlled failures.
 * No writes. No recursive recovery.
 */
export async function recoverAfterPermissionDenied<T>(
  params: RecoverAfterPermissionDeniedParams<T>
): Promise<RecoveredExistingRecord<T>> {
  const { recordId, monthKey, nowMs, parseExisting, cause, wrapped, readAuthoritative, quotaConsumption = "required" } = params;

  let state: AuthoritativeRecoveryState;
  try {
    state = await readAuthoritative();
  } catch (readErr) {
    const readWrapped = wrapAtomicCreateFailure(readErr);
    throw new AppError(readWrapped.code, readWrapped.message, readErr, {
      reason: "recovery_read_failed",
      originalFailure: wrapped.code,
    });
  }

  if (!recoveryStateIsAuthoritative(state)) {
    throw wrapped;
  }

  const accountStatus = state.account.exists ? state.account.data?.status : undefined;
  if (!state.account.exists || accountStatus !== "active") {
    throw wrapped;
  }

  if (state.record.exists) {
    if (state.record.id !== recordId || state.record.data == null) {
      throw wrapped;
    }
    try {
      return {
        outcome: "existing",
        record: parseExisting(state.record.id, state.record.data),
        serial: null,
      };
    } catch (parseErr) {
      throw wrapAtomicCreateFailure(parseErr);
    }
  }

  if (quotaConsumption === "none") {
    throw wrapped;
  }

  if (monthKey !== istMonthKeyForMillis(nowMs)) {
    throw wrapped;
  }

  if (!state.status.exists || state.status.data == null) {
    throw wrapped;
  }
  const statusData = state.status.data;
  if (!quotaEnforcementEnabledFromStatusData(statusData)) {
    throw wrapped;
  }
  const cap = monthlyRecordCapFromStatusData(statusData);
  if (cap === UNLIMITED_MONTHLY_RECORD_CAP) {
    throw wrapped;
  }

  if (!state.usage.exists || state.usage.data == null) {
    throw wrapped;
  }

  let usage;
  try {
    usage = readUsageSnapshot(state.usage.data);
  } catch (usageErr) {
    if (usageErr instanceof AppError && usageErr.code === "quota_state_invalid") {
      throw usageErr;
    }
    throw wrapped;
  }
  if (!usage || usage.monthKey !== monthKey || usage.recordsThisMonth < cap) {
    throw wrapped;
  }

  throw new AppError(
    "quota_exhausted",
    "Monthly record limit reached. This save was not completed.",
    cause,
    {
      reason: "quota_exhausted",
      recordsThisMonth: usage.recordsThisMonth,
      cap,
      monthKey,
    }
  );
}
