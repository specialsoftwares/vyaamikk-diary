import { doc, runTransaction, type Firestore } from "firebase/firestore";

import { AppError } from "@/domain/errors";
import {
  nextUsageWrite,
  readUsageSnapshot,
  type BillableRecordCollection,
} from "@/billing/optionC/usageTransition";
import { wrapAtomicCreateFailure } from "@/billing/optionC/classifyCreateError";
import {
  readRecoveryStateInTransaction,
  recoverAfterPermissionDenied,
} from "@/billing/optionC/recoverAfterPermissionDenied";
import {
  monthlyRecordCapFromStatusData,
  quotaEnforcementEnabledFromStatusData,
} from "@/subscription/monthlyRecordCap";

export type SerialCounterId = "purchaseOrder" | "customerCredit";

export interface AtomicCreateReadSnapshot {
  recordExists: boolean;
  statusExists: boolean;
  enforcementOn: boolean;
  cap: number | null;
  usageRecordsThisMonth: number | null;
  usageMonthKey: string | null;
  counterNext: number | null;
  /** Captured outside the transaction; retries must reuse this exact id. */
  recordId: string;
}

export interface AtomicCreateHooks {
  /**
   * Test-only barrier: invoked after all transaction reads and before writes.
   * Must not perform Firestore writes, network I/O, or mutate save locks.
   */
  afterReads?: (snapshot: AtomicCreateReadSnapshot) => Promise<void>;
}

export interface AtomicBillableCreateParams<T> {
  db: Firestore;
  userId: string;
  collection: BillableRecordCollection;
  /** Stable id generated outside this function. Never regenerated on retry. */
  recordId: string;
  serialCounter?: SerialCounterId;
  /** Captured outside the transaction so retries keep timestamps/monthKey. */
  nowMs: number;
  monthKey: string;
  parseExisting: (id: string, data: Record<string, unknown>) => T;
  buildNew: (serial: number | null) => {
    record: T;
    payload: Record<string, unknown>;
  };
  hooks?: AtomicCreateHooks;
}

export interface AtomicBillableCreateResult<T> {
  outcome: "created" | "existing";
  record: T;
  serial: number | null;
}

function num(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function statusRef(db: Firestore, userId: string) {
  return doc(db, "users", userId, "subscription", "status");
}
function usageRef(db: Firestore, userId: string) {
  return doc(db, "users", userId, "subscription", "usageCurrent");
}
function recordRef(db: Firestore, userId: string, collection: string, recordId: string) {
  return doc(db, "users", userId, collection, recordId);
}
function counterRef(db: Firestore, userId: string, counterId: SerialCounterId) {
  return doc(db, "users", userId, "counters", counterId);
}

/**
 * One Firestore transaction for a billable first CREATE.
 *
 * Reads (all before writes): record, status, usage (if enforcement on),
 * serial counter (if this family allocates at create).
 *
 * Record ID, nowMs and monthKey are captured by the caller before this
 * function; transaction retries reuse them. Existing-record hits return
 * without writes, quota increment, or serial allocation.
 *
 * Status missing → enforcement off (no usageCurrent write). A failed status
 * read throws (never treated as enforcement off). Cached UX entitlement is
 * not consulted.
 *
 * PO / Customer Credit compatibility: serial counter + record (+ usage)
 * now commit in this same transaction. Numbering format and counter schema
 * are unchanged; a rejected create no longer burns a serial.
 */
export async function runAtomicBillableCreate<T>(
  params: AtomicBillableCreateParams<T>
): Promise<AtomicBillableCreateResult<T>> {
  const {
    db,
    userId,
    collection,
    recordId,
    serialCounter,
    nowMs,
    monthKey,
    parseExisting,
    buildNew,
    hooks,
  } = params;

  try {
    return await runTransaction(db, async (tx) => {
      const recRef = recordRef(db, userId, collection, recordId);
      const recSnap = await tx.get(recRef);
      if (recSnap.exists()) {
        return {
          outcome: "existing" as const,
          record: parseExisting(recSnap.id, recSnap.data() as Record<string, unknown>),
          serial: null,
        };
      }

      const stSnap = await tx.get(statusRef(db, userId));
      const statusExists = stSnap.exists();
      const statusData = statusExists
        ? (stSnap.data() as Record<string, unknown>)
        : undefined;
      const enforcementOn =
        statusExists && quotaEnforcementEnabledFromStatusData(statusData);

      let cap: number | null = null;
      let usageRecordsThisMonth: number | null = null;
      let usageMonthKey: string | null = null;
      let usageRaw: Record<string, unknown> | undefined;

      if (enforcementOn) {
        cap = monthlyRecordCapFromStatusData(statusData ?? {});
        const uSnap = await tx.get(usageRef(db, userId));
        usageRaw = uSnap.exists() ? (uSnap.data() as Record<string, unknown>) : undefined;
        const usage = readUsageSnapshot(usageRaw);
        usageRecordsThisMonth = usage?.recordsThisMonth ?? null;
        usageMonthKey = usage?.monthKey ?? null;
      }

      let counterNext: number | null = null;
      let counterExists = false;
      if (serialCounter) {
        const cSnap = await tx.get(counterRef(db, userId, serialCounter));
        counterExists = cSnap.exists();
        if (counterExists) {
          const rawNext = (cSnap.data() as { next?: unknown }).next;
          if (typeof rawNext !== "number" || !Number.isInteger(rawNext) || rawNext < 0) {
            throw new AppError(
              "quota_state_invalid",
              "Serial counter is unreadable. This save was not completed.",
              undefined,
              { reason: "malformed_serial_counter" }
            );
          }
          counterNext = rawNext;
        } else {
          counterNext = 0;
        }
      }

      await hooks?.afterReads?.({
        recordExists: false,
        statusExists,
        enforcementOn,
        cap,
        usageRecordsThisMonth,
        usageMonthKey,
        counterNext,
        recordId,
      });

      let serial: number | null = null;
      if (serialCounter) {
        serial = (counterNext ?? 0) + 1;
        tx.set(
          counterRef(db, userId, serialCounter),
          { next: serial, updatedAt: nowMs },
          { merge: true }
        );
      }

      const built = buildNew(serial);
      tx.set(recRef, built.payload);

      if (enforcementOn) {
        const usage = readUsageSnapshot(usageRaw);
        const write = nextUsageWrite({
          existing: usage,
          monthKey,
          cap: cap ?? 25,
          collection,
          recordId,
          updatedAt: nowMs,
        });
        tx.set(usageRef(db, userId), write);
      }

      return {
        outcome: "created" as const,
        record: built.record,
        serial,
      };
    });
  } catch (error) {
    const wrapped = wrapAtomicCreateFailure(error);
    if (wrapped.code !== "permission_denied") throw wrapped;
    return recoverAfterPermissionDenied({
      recordId,
      monthKey,
      nowMs,
      parseExisting,
      cause: error,
      wrapped,
      readAuthoritative: () =>
        readRecoveryStateInTransaction(db, userId, collection, recordId),
    });
  }
}

/** Standalone serial allocation — public API compatibility. Does not create a record. */
export async function allocateSerialCounter(
  db: Firestore,
  userId: string,
  counterId: SerialCounterId
): Promise<number> {
  try {
    return await runTransaction(db, async (tx) => {
      const ref = counterRef(db, userId, counterId);
      const snap = await tx.get(ref);
      const current = snap.exists() ? num((snap.data() as { next?: number }).next) : 0;
      const next = current + 1;
      tx.set(ref, { next, updatedAt: Date.now() }, { merge: true });
      return next;
    });
  } catch (error) {
    throw wrapAtomicCreateFailure(error);
  }
}
