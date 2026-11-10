/**
 * Lead-owned lifetime free-admission policy.
 *
 * One trusted path across all record families (including GRIN first
 * issuance). Accepted record, quota consumption, and serial allocation
 * commit atomically on the trusted path. Operation IDs are owner- and
 * record-family-scoped. freeMembershipIds is bounded to 15; durable
 * receipts support retries without a second slot. Delete never refunds.
 * Paid-period creates do not spend free slots; on expiry prior usage resumes.
 *
 * Forward-only cutover is a migration proposal only — see
 * lifetimeCutoverDryRun — and must not be enabled live until the owner
 * sees provable vs ambiguous account counts.
 */

import { FREE_LIFETIME_RECORD_LIMIT } from "../../subscription/entitlementView";
import type { QuotaLinkedRecordCollection } from "./usageTransition";

export { FREE_LIFETIME_RECORD_LIMIT };

/** Families that consume one lifetime free slot on first successful create. */
export type LifetimeConsumingFamily =
  | "entries"
  | "purchaseOrders"
  | "customerCreditRecords"
  | "professionalPacks"
  | "goodsEvidenceReceipts";

export type LifetimeAdmissionOperationId = string;

export type LifetimeUsageSnapshot = {
  lifetimeAcceptedCount: number;
  /** First 15 free accepted record IDs; bounded; never grows past 15. */
  freeMembershipIds: readonly string[];
  /**
   * Durable receipts for in-flight / completed admissions.
   * Keyed by owner+family-scoped operationId. Survives delete of the
   * record so a retry cannot recreate or consume another slot.
   */
  admissionReceipts: Readonly<Record<string, LifetimeAdmissionReceipt>>;
};

export type LifetimeAdmissionReceipt = {
  operationId: LifetimeAdmissionOperationId;
  family: LifetimeConsumingFamily;
  recordId: string;
  /** Epoch ms when the admission committed (or was first reserved). */
  acceptedAt: number;
  /** True once the record write + membership were committed together. */
  committed: boolean;
};

export type LifetimeAdmissionDecision =
  | {
      kind: "existing";
      recordId: string;
      /** Replay of a prior accepted operation — no new slot. */
      operationId: LifetimeAdmissionOperationId;
    }
  | {
      kind: "accept_paid";
      recordId: string;
      operationId: LifetimeAdmissionOperationId;
      /** Paid path writes the record without mutating free membership. */
      nextUsage: LifetimeUsageSnapshot;
    }
  | {
      kind: "accept_free";
      recordId: string;
      operationId: LifetimeAdmissionOperationId;
      nextUsage: LifetimeUsageSnapshot;
      membershipIndex: number;
    }
  | {
      kind: "reject_exhausted";
      used: number;
      limit: typeof FREE_LIFETIME_RECORD_LIMIT;
      /** Caller must retain input as a recoverable draft. */
      preserveAsDraft: true;
    }
  | {
      kind: "reject_receipt_conflict";
      operationId: LifetimeAdmissionOperationId;
      existingRecordId: string;
      requestedRecordId: string;
    }
  | { kind: "reject_unknown_entitlement"; preserveAsDraft: true };

export function isLifetimeConsumingFamily(
  collection: string
): collection is LifetimeConsumingFamily {
  return (
    collection === "entries" ||
    collection === "purchaseOrders" ||
    collection === "customerCreditRecords" ||
    collection === "professionalPacks" ||
    collection === "goodsEvidenceReceipts"
  );
}

export function toLifetimeConsumingFamily(
  collection: QuotaLinkedRecordCollection
): LifetimeConsumingFamily | null {
  return isLifetimeConsumingFamily(collection) ? collection : null;
}

/**
 * Owner- and record-family-scoped operation id.
 * Callers must generate this once outside the transaction and reuse it
 * on every retry for the same create intent.
 */
export function lifetimeOperationId(args: {
  ownerUid: string;
  family: LifetimeConsumingFamily;
  intentId: string;
}): LifetimeAdmissionOperationId {
  const intent = args.intentId.trim();
  if (!args.ownerUid || !intent) {
    throw new Error("lifetime_operation_id_invalid");
  }
  return `${args.ownerUid}:${args.family}:${intent}`;
}

export function emptyLifetimeUsage(): LifetimeUsageSnapshot {
  return {
    lifetimeAcceptedCount: 0,
    freeMembershipIds: [],
    admissionReceipts: {},
  };
}

export function readLifetimeUsageSnapshot(
  raw: Record<string, unknown> | undefined
): LifetimeUsageSnapshot | null | { malformed: true } {
  if (raw == null) return null;
  const count = raw.lifetimeAcceptedCount;
  const ids = raw.freeMembershipIds;
  const receiptsRaw = raw.admissionReceipts;
  if (count == null && ids == null && receiptsRaw == null) {
    // Monthly-only legacy doc without lifetime fields → empty lifetime.
    return emptyLifetimeUsage();
  }
  if (
    typeof count !== "number" ||
    !Number.isInteger(count) ||
    count < 0 ||
    count > FREE_LIFETIME_RECORD_LIMIT
  ) {
    return { malformed: true };
  }
  if (!Array.isArray(ids)) return { malformed: true };
  if (ids.length > FREE_LIFETIME_RECORD_LIMIT) return { malformed: true };
  if (ids.length !== count && !(count === 0 && ids.length === 0)) {
    // Count must equal membership length for free admissions.
    if (ids.some((id) => typeof id !== "string" || id.length === 0)) {
      return { malformed: true };
    }
  }
  for (const id of ids) {
    if (typeof id !== "string" || id.length === 0) return { malformed: true };
  }
  const admissionReceipts: Record<string, LifetimeAdmissionReceipt> = {};
  if (receiptsRaw != null) {
    if (typeof receiptsRaw !== "object" || Array.isArray(receiptsRaw)) {
      return { malformed: true };
    }
    for (const [key, value] of Object.entries(
      receiptsRaw as Record<string, unknown>
    )) {
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        return { malformed: true };
      }
      const r = value as Record<string, unknown>;
      if (
        typeof r.operationId !== "string" ||
        r.operationId !== key ||
        !isLifetimeConsumingFamily(String(r.family)) ||
        typeof r.recordId !== "string" ||
        r.recordId.length === 0 ||
        typeof r.acceptedAt !== "number" ||
        !Number.isFinite(r.acceptedAt) ||
        typeof r.committed !== "boolean"
      ) {
        return { malformed: true };
      }
      admissionReceipts[key] = {
        operationId: r.operationId,
        family: r.family as LifetimeConsumingFamily,
        recordId: r.recordId,
        acceptedAt: r.acceptedAt,
        committed: r.committed,
      };
    }
  }
  return {
    lifetimeAcceptedCount: count,
    freeMembershipIds: ids as string[],
    admissionReceipts,
  };
}

/**
 * Decide admission before any write. Pure — the trusted path applies
 * `nextUsage` + record + serial in one transaction.
 */
export function decideLifetimeAdmission(args: {
  entitlement: "unknown" | "free" | "paid";
  existing: LifetimeUsageSnapshot | null;
  operationId: LifetimeAdmissionOperationId;
  family: LifetimeConsumingFamily;
  recordId: string;
  nowMs: number;
  /** True when the record document already exists (lost-response replay). */
  recordExists: boolean;
}): LifetimeAdmissionDecision {
  const { entitlement, operationId, family, recordId, nowMs, recordExists } = args;
  const existing = args.existing ?? emptyLifetimeUsage();
  const prior = existing.admissionReceipts[operationId];

  if (prior) {
    if (prior.recordId !== recordId) {
      return {
        kind: "reject_receipt_conflict",
        operationId,
        existingRecordId: prior.recordId,
        requestedRecordId: recordId,
      };
    }
    // Retry after deletion: receipt remains → no recreate, no new slot.
    return { kind: "existing", recordId: prior.recordId, operationId };
  }

  if (recordExists) {
    // Existing doc without a receipt still replays as existing (legacy /
    // older writers). Does not consume an additional free slot here.
    return { kind: "existing", recordId, operationId };
  }

  if (entitlement === "unknown") {
    return { kind: "reject_unknown_entitlement", preserveAsDraft: true };
  }

  if (entitlement === "paid") {
    const receipt: LifetimeAdmissionReceipt = {
      operationId,
      family,
      recordId,
      acceptedAt: nowMs,
      committed: true,
    };
    return {
      kind: "accept_paid",
      recordId,
      operationId,
      nextUsage: {
        ...existing,
        admissionReceipts: {
          ...existing.admissionReceipts,
          [operationId]: receipt,
        },
      },
    };
  }

  if (existing.lifetimeAcceptedCount >= FREE_LIFETIME_RECORD_LIMIT) {
    return {
      kind: "reject_exhausted",
      used: existing.lifetimeAcceptedCount,
      limit: FREE_LIFETIME_RECORD_LIMIT,
      preserveAsDraft: true,
    };
  }

  if (existing.freeMembershipIds.length >= FREE_LIFETIME_RECORD_LIMIT) {
    return {
      kind: "reject_exhausted",
      used: existing.freeMembershipIds.length,
      limit: FREE_LIFETIME_RECORD_LIMIT,
      preserveAsDraft: true,
    };
  }

  const membershipIndex = existing.freeMembershipIds.length;
  const receipt: LifetimeAdmissionReceipt = {
    operationId,
    family,
    recordId,
    acceptedAt: nowMs,
    committed: true,
  };
  return {
    kind: "accept_free",
    recordId,
    operationId,
    membershipIndex,
    nextUsage: {
      lifetimeAcceptedCount: existing.lifetimeAcceptedCount + 1,
      freeMembershipIds: [...existing.freeMembershipIds, recordId],
      admissionReceipts: {
        ...existing.admissionReceipts,
        [operationId]: receipt,
      },
    },
  };
}

/**
 * Two-device race helper for tests / documentation: at most one accept_free
 * from identical 14/15 snapshots; the loser must preserve as draft.
 */
export function resolveConcurrentFreeAdmissions(args: {
  baseline: LifetimeUsageSnapshot;
  first: {
    operationId: LifetimeAdmissionOperationId;
    family: LifetimeConsumingFamily;
    recordId: string;
  };
  second: {
    operationId: LifetimeAdmissionOperationId;
    family: LifetimeConsumingFamily;
    recordId: string;
  };
  nowMs: number;
}): {
  winner: Extract<LifetimeAdmissionDecision, { kind: "accept_free" }>;
  loser: Extract<LifetimeAdmissionDecision, { kind: "reject_exhausted" }>;
} {
  const firstDecision = decideLifetimeAdmission({
    entitlement: "free",
    existing: args.baseline,
    operationId: args.first.operationId,
    family: args.first.family,
    recordId: args.first.recordId,
    nowMs: args.nowMs,
    recordExists: false,
  });
  if (firstDecision.kind !== "accept_free") {
    throw new Error("expected_first_accept_free");
  }
  const secondDecision = decideLifetimeAdmission({
    entitlement: "free",
    existing: firstDecision.nextUsage,
    operationId: args.second.operationId,
    family: args.second.family,
    recordId: args.second.recordId,
    nowMs: args.nowMs + 1,
    recordExists: false,
  });
  if (secondDecision.kind !== "reject_exhausted") {
    throw new Error("expected_second_reject_exhausted");
  }
  return { winner: firstDecision, loser: secondDecision };
}

/** Migration proposal — dry-run classification only. Not a live policy. */
export type LifetimeCutoverAccountClass =
  | "provable_history"
  | "ambiguous_history"
  | "paid_active"
  | "empty";

export type LifetimeCutoverDryRunSummary = {
  policy: "forward_only_proposal";
  enabledLive: false;
  counts: Record<LifetimeCutoverAccountClass, number>;
};

export function summarizeLifetimeCutoverDryRun(
  accounts: ReadonlyArray<{ classification: LifetimeCutoverAccountClass }>
): LifetimeCutoverDryRunSummary {
  const counts: Record<LifetimeCutoverAccountClass, number> = {
    provable_history: 0,
    ambiguous_history: 0,
    paid_active: 0,
    empty: 0,
  };
  for (const account of accounts) {
    counts[account.classification] += 1;
  }
  return {
    policy: "forward_only_proposal",
    enabledLive: false,
    counts,
  };
}

/** Merge lifetime admission into a monthly usage write (single usageCurrent doc). */
export function mergeLifetimeIntoUsageWrite(
  monthly: {
    monthKey: string;
    recordsThisMonth: number;
    lastRecordCollection: string;
    lastRecordId: string;
    updatedAt: number;
  },
  lifetime: LifetimeUsageSnapshot
): Record<string, unknown> {
  return {
    ...monthly,
    lifetimeAcceptedCount: lifetime.lifetimeAcceptedCount,
    freeMembershipIds: [...lifetime.freeMembershipIds],
    admissionReceipts: { ...lifetime.admissionReceipts },
  };
}

/**
 * Classify one account for the forward-only migration proposal.
 * Does not invent history — ambiguous when deletes/missing prevent a proof.
 */
export function classifyLifetimeCutoverAccount(input: {
  entitlementActive: boolean;
  survivingCreateCount: number | null;
  hasDeleteEvidence: boolean;
  hasMissingHistoryGaps: boolean;
}): LifetimeCutoverAccountClass {
  if (input.entitlementActive) return "paid_active";
  if (input.survivingCreateCount == null) return "ambiguous_history";
  if (input.survivingCreateCount === 0 && !input.hasDeleteEvidence) return "empty";
  if (input.hasDeleteEvidence || input.hasMissingHistoryGaps) return "ambiguous_history";
  return "provable_history";
}
