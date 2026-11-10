import { doc, getDocFromServer, runTransaction, type Firestore, type Transaction } from "firebase/firestore";

import { AppError } from "@/domain/errors";
import {
  nextUsageWrite,
  readUsageSnapshot,
  type BillableRecordCollection,
  type QuotaLinkedRecordCollection,
} from "@/billing/optionC/usageTransition";
import {
  decideLifetimeAdmission,
  emptyLifetimeUsage,
  isLifetimeConsumingFamily,
  lifetimeOperationId,
  mergeLifetimeIntoUsageWrite,
  readLifetimeUsageSnapshot,
  type LifetimeConsumingFamily,
} from "@/billing/optionC/lifetimeAdmission";
import { wrapAtomicCreateFailure } from "@/billing/optionC/classifyCreateError";
import {
  readRecoveryStateInTransaction,
  recoverAfterPermissionDenied,
} from "@/billing/optionC/recoverAfterPermissionDenied";
import {
  monthlyRecordCapFromStatusData,
  quotaEnforcementEnabledFromStatusData,
  STARTER_MONTHLY_RECORD_CAP,
  UNLIMITED_MONTHLY_RECORD_CAP,
} from "@/subscription/monthlyRecordCap";
import { SaveRetryableError } from "@/services/records/saveLockTypes";
import { assertDispatchedSession } from "@/sync/syncSessionOwnership";

export type SerialCounterId = "purchaseOrder" | "customerCredit";

/** Ordinary families consume quota. Letterhead parent/mirror use `"none"`. */
export type AtomicQuotaConsumption = "required" | "none";

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
  /** Prepare protection once, before the transaction; the returned transform is synchronous. */
  prepareCloudPayload?: (payload: Record<string, unknown>) => Promise<(payload: Record<string, unknown>) => Record<string, unknown>>;
  /**
   * Test-only barrier: invoked after all transaction reads and before writes.
   * Must not perform Firestore writes, network I/O, or mutate save locks.
   */
  afterReads?: (snapshot: AtomicCreateReadSnapshot) => Promise<void>;
  /**
   * Extra transactional reads (for example the letterhead parent). Must run
   * after the record existence read and before writes.
   */
  extraReads?: (tx: Transaction) => Promise<void>;
  /**
   * Originating admission token. Rechecked after transaction reads and
   * `afterReads`, before any mutation. Omitted (`undefined`) skips the
   * check. Explicit `null` is fail-closed. Never recaptures the live session.
   */
  session?: import("@/sync/syncSessionOwnership").SyncSessionToken | null;
}

export interface AtomicBillableCreateParams<T> {
  db: Firestore;
  userId: string;
  collection: BillableRecordCollection;
  /** Stable id generated outside this function. Never regenerated on retry. */
  recordId: string;
  /**
   * Owner- and family-scoped operation id. When omitted, derived from
   * `lifetimeOperationId({ ownerUid, family, intentId: recordId })`.
   * Retries must reuse the same id.
   */
  operationId?: string;
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
  /**
   * `"none"` skips status/usage reads and does not write `usageCurrent`.
   * Default `"required"` is the ordinary billable create path.
   */
  quotaConsumption?: AtomicQuotaConsumption;
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

function entitlementKindFromStatus(
  statusData: Record<string, unknown> | undefined,
  cap: number
): "free" | "paid" {
  if (statusData?.entitlementActive !== true) return "free";
  if (cap === UNLIMITED_MONTHLY_RECORD_CAP) return "paid";
  if (cap === STARTER_MONTHLY_RECORD_CAP) return "paid";
  return "free";
}

/**
 * One Firestore transaction for a billable first CREATE.
 *
 * Trusted path: accepted record + quota consumption + serial allocation
 * commit together. Free accounts use the lifetime admission policy (15).
 * Paid accounts (including legacy Starter) do not spend free membership.
 * Older clients that skip usage still cannot bypass once create rules enforce.
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
    quotaConsumption = "required",
  } = params;

  const family: LifetimeConsumingFamily | null = isLifetimeConsumingFamily(collection)
    ? collection
    : null;
  const operationId =
    params.operationId ??
    (family
      ? lifetimeOperationId({ ownerUid: userId, family, intentId: recordId })
      : `${userId}:other:${recordId}`);

  try {
    let cloudPayload = (payload: Record<string, unknown>) => payload;
    if (hooks?.prepareCloudPayload) {
      const existing = await getDocFromServer(recordRef(db, userId, collection, recordId));
      if (existing.exists()) {
        return { outcome: "existing", record: parseExisting(existing.id, existing.data()), serial: null };
      }
      cloudPayload = await hooks.prepareCloudPayload(buildNew(serialCounter ? 1 : null).payload);
    }
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

      await hooks?.extraReads?.(tx);

      const consumesQuota = quotaConsumption === "required";
      let statusExists = false;
      let statusData: Record<string, unknown> | undefined;
      let enforcementOn = false;
      let cap: number | null = null;
      let usageRecordsThisMonth: number | null = null;
      let usageMonthKey: string | null = null;
      let usageRaw: Record<string, unknown> | undefined;

      if (consumesQuota) {
        const stSnap = await tx.get(statusRef(db, userId));
        statusExists = stSnap.exists();
        statusData = statusExists ? (stSnap.data() as Record<string, unknown>) : undefined;
        enforcementOn = statusExists && quotaEnforcementEnabledFromStatusData(statusData);

        if (enforcementOn) {
          cap = monthlyRecordCapFromStatusData(statusData ?? {});
          const uSnap = await tx.get(usageRef(db, userId));
          usageRaw = uSnap.exists() ? (uSnap.data() as Record<string, unknown>) : undefined;
          // Monthly snapshot may be absent on lifetime-only docs; lifetime reader is separate.
          try {
            const usage = readUsageSnapshot(usageRaw);
            usageRecordsThisMonth = usage?.recordsThisMonth ?? null;
            usageMonthKey = usage?.monthKey ?? null;
          } catch (err) {
            // Lifetime-only docs without monthly fields: allow lifetime path; starter monthly still needs valid monthly.
            if (cap === STARTER_MONTHLY_RECORD_CAP) throw err;
            usageRecordsThisMonth = null;
            usageMonthKey = null;
          }
        }
      }

      let counterNext: number | null = null;
      if (serialCounter) {
        const cSnap = await tx.get(counterRef(db, userId, serialCounter));
        if (cSnap.exists()) {
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

      if (hooks && Object.prototype.hasOwnProperty.call(hooks, "session")) {
        assertDispatchedSession(hooks.session, userId);
      }

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
      tx.set(recRef, cloudPayload(built.payload));

      if (consumesQuota && enforcementOn) {
        if (collection === "letterheadDocs") {
          throw new AppError(
            "save_failed",
            "Letterhead must not consume ordinary quota.",
            undefined,
            { reason: "letterhead_quota_write_denied" }
          );
        }
        if (!family) {
          throw new AppError(
            "save_failed",
            "This record family cannot consume quota.",
            undefined,
            { reason: "quota_family_unsupported" }
          );
        }

        const entitlement = entitlementKindFromStatus(statusData, cap ?? 25);
        const lifetimeParsed = readLifetimeUsageSnapshot(usageRaw);
        if (lifetimeParsed && "malformed" in lifetimeParsed) {
          throw new AppError(
            "quota_state_invalid",
            "Usage state is unreadable. This save was not completed.",
            undefined,
            { reason: "malformed_lifetime_usage" }
          );
        }
        const lifetimeExisting = lifetimeParsed ?? emptyLifetimeUsage();
        const decision = decideLifetimeAdmission({
          entitlement,
          existing: lifetimeExisting,
          operationId,
          family,
          recordId,
          nowMs,
          recordExists: false,
        });

        if (decision.kind === "existing") {
          // Receipt replay without a live doc should not recreate — fail closed.
          throw new AppError(
            "quota_exhausted",
            "This create was already admitted and cannot consume another slot.",
            undefined,
            {
              reason: "lifetime_receipt_replay",
              operationId: decision.operationId,
              recordId: decision.recordId,
              preserveAsDraft: true,
            }
          );
        }
        if (decision.kind === "reject_exhausted" || decision.kind === "reject_unknown_entitlement") {
          throw new AppError(
            "quota_exhausted",
            decision.kind === "reject_unknown_entitlement"
              ? "Your plan could not be confirmed. This save was kept as a draft."
              : "Free record limit reached. This save was kept as a draft.",
            undefined,
            {
              reason: decision.kind,
              preserveAsDraft: true,
              ...(decision.kind === "reject_exhausted"
                ? { used: decision.used, limit: decision.limit }
                : {}),
            }
          );
        }
        if (decision.kind === "reject_receipt_conflict") {
          throw new AppError(
            "quota_state_invalid",
            "This create conflicts with a prior admission receipt.",
            undefined,
            { reason: "lifetime_receipt_conflict", ...decision }
          );
        }

        // Monthly transition: Starter keeps its existing cap; unlimited still records usage.
        // Free lifetime does not gate on the legacy monthly 25.
        const monthlyCap =
          entitlement === "paid" && cap === STARTER_MONTHLY_RECORD_CAP
            ? STARTER_MONTHLY_RECORD_CAP
            : UNLIMITED_MONTHLY_RECORD_CAP;
        let monthlyExisting = null as ReturnType<typeof readUsageSnapshot>;
        try {
          monthlyExisting = readUsageSnapshot(usageRaw);
        } catch {
          monthlyExisting = null;
        }
        const monthlyWrite = nextUsageWrite({
          existing: monthlyExisting,
          monthKey,
          cap: monthlyCap,
          collection: collection as QuotaLinkedRecordCollection,
          recordId,
          updatedAt: nowMs,
        });
        const usageWrite = mergeLifetimeIntoUsageWrite(monthlyWrite, decision.nextUsage);
        tx.set(usageRef(db, userId), usageWrite);
      }

      return {
        outcome: "created" as const,
        record: built.record,
        serial,
      };
    });
  } catch (error) {
    if (error instanceof SaveRetryableError) throw error;
    if (error && typeof error === "object" && "cause" in error) {
      const cause = (error as { cause: unknown }).cause;
      if (cause instanceof SaveRetryableError) throw cause;
    }
    const wrapped = wrapAtomicCreateFailure(error);
    if (wrapped.code !== "permission_denied") throw wrapped;
    return recoverAfterPermissionDenied({
      recordId,
      monthKey,
      nowMs,
      parseExisting,
      cause: error,
      wrapped,
      quotaConsumption,
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
