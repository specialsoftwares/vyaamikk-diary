import { AppError } from "@/domain/errors";
import { isIstMonthKeyShape } from "@/billing/istMonthKey";
import { UNLIMITED_MONTHLY_RECORD_CAP } from "@/subscription/monthlyRecordCap";

export type QuotaLinkedRecordCollection =
  | "purchaseOrders"
  | "customerCreditRecords"
  | "professionalPacks"
  | "entries";

/** Historical usage docs may still name letterheadDocs. New writes must not. */
export type BillableRecordCollection = QuotaLinkedRecordCollection | "letterheadDocs";

export interface UsageCurrentSnapshot {
  monthKey: string;
  recordsThisMonth: number;
  lastRecordCollection: string;
  lastRecordId: string;
}

export interface UsageCurrentWrite {
  monthKey: string;
  recordsThisMonth: number;
  lastRecordCollection: QuotaLinkedRecordCollection;
  lastRecordId: string;
  updatedAt: number;
}

/**
 * Read a usage document. Missing → null. Malformed → throw quota_state_invalid
 * (do not treat as first-create or same-month reset).
 */
export function readUsageSnapshot(raw: Record<string, unknown> | undefined): UsageCurrentSnapshot | null {
  if (raw == null) return null;
  const monthKey = raw.monthKey;
  const recordsThisMonth = raw.recordsThisMonth;
  const lastRecordCollection = raw.lastRecordCollection;
  const lastRecordId = raw.lastRecordId;
  const countIsInt =
    typeof recordsThisMonth === "number" &&
    Number.isInteger(recordsThisMonth) &&
    recordsThisMonth >= 1;
  const collectionOk =
    typeof lastRecordCollection === "string" && lastRecordCollection.length > 0;
  const idOk = typeof lastRecordId === "string" && lastRecordId.length > 0;
  if (!isIstMonthKeyShape(monthKey) || !countIsInt || !collectionOk || !idOk) {
    throw new AppError(
      "quota_state_invalid",
      "Usage state is unreadable. This save was not completed.",
      undefined,
      { reason: "malformed_usage" }
    );
  }
  return {
    monthKey,
    recordsThisMonth,
    lastRecordCollection,
    lastRecordId,
  };
}

/**
 * Next usage write for a genuine new record in `monthKey`.
 * Unlimited (`cap === -1`) still requires the transition.
 */
export function nextUsageWrite(params: {
  existing: UsageCurrentSnapshot | null;
  monthKey: string;
  cap: number;
  collection: QuotaLinkedRecordCollection;
  recordId: string;
  updatedAt: number;
}): UsageCurrentWrite {
  const { existing, monthKey, cap, collection, recordId, updatedAt } = params;
  let recordsThisMonth: number;
  if (existing == null) {
    recordsThisMonth = 1;
  } else if (existing.monthKey === monthKey) {
    recordsThisMonth = existing.recordsThisMonth + 1;
  } else {
    recordsThisMonth = 1;
  }

  if (cap !== UNLIMITED_MONTHLY_RECORD_CAP && recordsThisMonth > cap) {
    throw new AppError(
      "quota_exhausted",
      "Monthly record limit reached. This save was not completed.",
      undefined,
      {
        reason: "quota_exhausted",
        recordsThisMonth: existing?.monthKey === monthKey ? existing.recordsThisMonth : 0,
        cap,
        monthKey,
      }
    );
  }

  return {
    monthKey,
    recordsThisMonth,
    lastRecordCollection: collection,
    lastRecordId: recordId,
    updatedAt,
  };
}
