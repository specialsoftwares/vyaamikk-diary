/**
 * Server-side first-issuance quota for GRIN register (Admin transaction).
 *
 * Shares the same lifetime free-admission policy as ordinary Option-C creates
 * (15 free membership slots + durable receipts). Packaging-safe: no @/ imports.
 * lastRecordCollection value is `goodsEvidenceReceipts`. Mutations, retry, QC,
 * return, evidence link, and reconcile do not call this module.
 */

export const GRIN_USAGE_COLLECTION = "goodsEvidenceReceipts" as const;

export const FREE_LIFETIME_RECORD_LIMIT = 15 as const;
export const UNLIMITED_MONTHLY_RECORD_CAP = -1;
export const FREE_MONTHLY_RECORD_CAP = 25;
export const STARTER_MONTHLY_RECORD_CAP = 100;
export const IST_UTC_OFFSET_MS = 19_800_000;

export type GrinUsageSnapshot = {
  monthKey: string;
  recordsThisMonth: number;
  lastRecordCollection: string;
  lastRecordId: string;
};

export type GrinLifetimeFamily =
  | "entries"
  | "purchaseOrders"
  | "customerCreditRecords"
  | "professionalPacks"
  | typeof GRIN_USAGE_COLLECTION;

export type GrinLifetimeReceipt = {
  operationId: string;
  family: GrinLifetimeFamily;
  recordId: string;
  acceptedAt: number;
  committed: boolean;
};

function isGrinLifetimeFamily(value: string): value is GrinLifetimeFamily {
  return (
    value === "entries" ||
    value === "purchaseOrders" ||
    value === "customerCreditRecords" ||
    value === "professionalPacks" ||
    value === GRIN_USAGE_COLLECTION
  );
}

export type GrinLifetimeUsage = {
  lifetimeAcceptedCount: number;
  freeMembershipIds: readonly string[];
  admissionReceipts: Readonly<Record<string, GrinLifetimeReceipt>>;
};

export type GrinUsageWrite = {
  monthKey: string;
  recordsThisMonth: number;
  lastRecordCollection: typeof GRIN_USAGE_COLLECTION;
  lastRecordId: string;
  updatedAt: number;
  lifetimeAcceptedCount: number;
  freeMembershipIds: string[];
  admissionReceipts: Record<string, GrinLifetimeReceipt>;
};

export type GrinIssuanceQuotaDecision =
  | { kind: "enforcement_off" }
  | { kind: "write"; doc: GrinUsageWrite }
  | {
      kind: "quota_exhausted";
      recordsThisMonth: number;
      cap: number;
      monthKey: string;
      reason?: string;
    }
  | { kind: "quota_state_invalid"; reason: string };

export function istMonthKeyForMillis(utcMillis: number): string {
  const shifted = new Date(utcMillis + IST_UTC_OFFSET_MS);
  const year = shifted.getUTCFullYear();
  const month = shifted.getUTCMonth() + 1;
  return `${year}-${month < 10 ? `0${month}` : month}`;
}

export function isIstMonthKeyShape(value: unknown): value is string {
  return typeof value === "string" && value.length === 7 && value.charAt(4) === "-";
}

export function monthlyRecordCapFromStatusData(statusData: Record<string, unknown>): number {
  const entitled = statusData.entitlementActive === true;
  const plan = entitled ? statusData.plan : "free";
  if (plan === "starter") return STARTER_MONTHLY_RECORD_CAP;
  if (plan === "professional" || plan === "business" || plan === "unlimited") {
    return UNLIMITED_MONTHLY_RECORD_CAP;
  }
  return FREE_MONTHLY_RECORD_CAP;
}

export function quotaEnforcementEnabledFromStatusData(
  statusData: Record<string, unknown> | undefined
): boolean {
  return statusData?.quotaEnforcementEnabled === true;
}

export function grinLifetimeOperationId(ownerUid: string, intentId: string): string {
  return `${ownerUid}:${GRIN_USAGE_COLLECTION}:${intentId}`;
}

/**
 * Missing → null. Malformed → quota_state_invalid (never first-create).
 * lastRecordCollection is any non-empty string so historical letterheadDocs
 * and goodsEvidenceReceipts both remain readable.
 */
export function readGrinUsageSnapshot(
  raw: Record<string, unknown> | undefined
): GrinUsageSnapshot | null | { malformed: true } {
  if (raw == null) return null;
  const monthKey = raw.monthKey;
  const recordsThisMonth = raw.recordsThisMonth;
  const lastRecordCollection = raw.lastRecordCollection;
  const lastRecordId = raw.lastRecordId;
  const countIsInt =
    typeof recordsThisMonth === "number" &&
    Number.isInteger(recordsThisMonth) &&
    recordsThisMonth >= 1;
  const collectionOk = typeof lastRecordCollection === "string" && lastRecordCollection.length > 0;
  const idOk = typeof lastRecordId === "string" && lastRecordId.length > 0;
  if (!isIstMonthKeyShape(monthKey) || !countIsInt || !collectionOk || !idOk) {
    return { malformed: true };
  }
  return {
    monthKey,
    recordsThisMonth,
    lastRecordCollection,
    lastRecordId,
  };
}

export function emptyGrinLifetimeUsage(): GrinLifetimeUsage {
  return {
    lifetimeAcceptedCount: 0,
    freeMembershipIds: [],
    admissionReceipts: {},
  };
}

export function readGrinLifetimeUsage(
  raw: Record<string, unknown> | undefined
): GrinLifetimeUsage | null | { malformed: true } {
  if (raw == null) return null;
  const hasLifetimeKeys =
    Object.prototype.hasOwnProperty.call(raw, "lifetimeAcceptedCount") ||
    Object.prototype.hasOwnProperty.call(raw, "freeMembershipIds") ||
    Object.prototype.hasOwnProperty.call(raw, "admissionReceipts");
  if (!hasLifetimeKeys) return emptyGrinLifetimeUsage();

  const count = raw.lifetimeAcceptedCount;
  if (typeof count !== "number" || !Number.isInteger(count) || count < 0) {
    return { malformed: true };
  }
  const idsRaw = raw.freeMembershipIds;
  if (!Array.isArray(idsRaw) || idsRaw.length > FREE_LIFETIME_RECORD_LIMIT) {
    return { malformed: true };
  }
  const freeMembershipIds: string[] = [];
  for (const id of idsRaw) {
    if (typeof id !== "string" || id.length === 0 || id.length > 200) return { malformed: true };
    freeMembershipIds.push(id);
  }
  const receiptsRaw = raw.admissionReceipts;
  const admissionReceipts: Record<string, GrinLifetimeReceipt> = {};
  if (receiptsRaw != null) {
    if (typeof receiptsRaw !== "object" || Array.isArray(receiptsRaw)) return { malformed: true };
    for (const [key, value] of Object.entries(receiptsRaw as Record<string, unknown>)) {
      if (!value || typeof value !== "object" || Array.isArray(value)) return { malformed: true };
      const r = value as Record<string, unknown>;
      if (
        typeof r.operationId !== "string" ||
        r.operationId !== key ||
        typeof r.family !== "string" ||
        !isGrinLifetimeFamily(r.family) ||
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
        family: r.family,
        recordId: r.recordId,
        acceptedAt: r.acceptedAt,
        committed: r.committed,
      };
    }
  }
  return { lifetimeAcceptedCount: count, freeMembershipIds, admissionReceipts };
}

/** Monthly +1 / rollover write shape (no lifetime fields). */
export function nextGrinUsageWrite(params: {
  existing: GrinUsageSnapshot | null;
  monthKey: string;
  cap: number;
  recordId: string;
  updatedAt: number;
}):
  | { kind: "write"; doc: Omit<GrinUsageWrite, "lifetimeAcceptedCount" | "freeMembershipIds" | "admissionReceipts"> }
  | {
      kind: "quota_exhausted";
      recordsThisMonth: number;
      cap: number;
      monthKey: string;
    } {
  const { existing, monthKey, cap, recordId, updatedAt } = params;
  let recordsThisMonth: number;
  if (existing == null) {
    recordsThisMonth = 1;
  } else if (existing.monthKey === monthKey) {
    recordsThisMonth = existing.recordsThisMonth + 1;
  } else {
    recordsThisMonth = 1;
  }
  if (cap !== UNLIMITED_MONTHLY_RECORD_CAP && recordsThisMonth > cap) {
    return {
      kind: "quota_exhausted",
      recordsThisMonth: existing?.monthKey === monthKey ? existing.recordsThisMonth : 0,
      cap,
      monthKey,
    };
  }
  return {
    kind: "write",
    doc: {
      monthKey,
      recordsThisMonth,
      lastRecordCollection: GRIN_USAGE_COLLECTION,
      lastRecordId: recordId,
      updatedAt,
    },
  };
}

/** Mirrors atomicBillableCreate entitlementKindFromStatus (Starter stays paid). */
function entitlementKind(
  statusData: Record<string, unknown> | undefined
): "unknown" | "free" | "paid" {
  if (!statusData) return "unknown";
  if (statusData.entitlementActive !== true) return "free";
  const cap = monthlyRecordCapFromStatusData(statusData);
  if (cap === UNLIMITED_MONTHLY_RECORD_CAP || cap === STARTER_MONTHLY_RECORD_CAP) {
    return "paid";
  }
  return "free";
}

/**
 * Status missing → enforcement off. Failed status *read* is the caller's
 * throw (do not pass a fake empty object). quotaEnforcementEnabled false → off.
 *
 * Free accounts gate on lifetime 15 (shared with ordinary creates). Paid /
 * legacy Starter keep monthly caps and do not spend free membership.
 */
export function decideGrinIssuanceQuota(params: {
  statusExists: boolean;
  statusData: Record<string, unknown> | undefined;
  usageRaw: Record<string, unknown> | undefined;
  recordId: string;
  nowMs: number;
  /** Owner uid — required for stable lifetime operation id. */
  ownerUid?: string;
  /** Stable intent (commandId). Defaults to recordId. */
  intentId?: string;
  /** True when the receipt document already exists (lost-response replay). */
  recordExists?: boolean;
}): GrinIssuanceQuotaDecision {
  if (!params.statusExists) return { kind: "enforcement_off" };
  if (!quotaEnforcementEnabledFromStatusData(params.statusData)) {
    return { kind: "enforcement_off" };
  }

  const lifetime = readGrinLifetimeUsage(params.usageRaw);
  if (lifetime && "malformed" in lifetime) {
    return { kind: "quota_state_invalid", reason: "malformed_lifetime_usage" };
  }
  const monthly = readGrinUsageSnapshot(params.usageRaw);
  // Monthly fields may be absent on a brand-new lifetime-only doc; treat as null
  // unless the monthly shape is explicitly malformed when monthly keys exist.
  if (
    monthly &&
    "malformed" in monthly &&
    params.usageRaw &&
    Object.prototype.hasOwnProperty.call(params.usageRaw, "monthKey")
  ) {
    return { kind: "quota_state_invalid", reason: "malformed_usage" };
  }

  const entitlement = entitlementKind(params.statusData);
  const ownerUid = params.ownerUid ?? "unknown";
  const intentId = params.intentId ?? params.recordId;
  const operationId = grinLifetimeOperationId(ownerUid, intentId);
  const existingLifetime = lifetime ?? emptyGrinLifetimeUsage();
  const prior = existingLifetime.admissionReceipts[operationId];

  if (prior) {
    // Retry after deletion / lost response: receipt remains → no recreate, no new slot.
    return {
      kind: "quota_exhausted",
      recordsThisMonth: existingLifetime.lifetimeAcceptedCount,
      cap: FREE_LIFETIME_RECORD_LIMIT,
      monthKey: istMonthKeyForMillis(params.nowMs),
      reason: "lifetime_receipt_replay",
    };
  }
  if (params.recordExists) {
    return {
      kind: "quota_exhausted",
      recordsThisMonth: existingLifetime.lifetimeAcceptedCount,
      cap: FREE_LIFETIME_RECORD_LIMIT,
      monthKey: istMonthKeyForMillis(params.nowMs),
      reason: "lifetime_record_exists",
    };
  }

  if (entitlement === "unknown") {
    return { kind: "quota_state_invalid", reason: "unknown_entitlement" };
  }

  let nextLifetime: GrinLifetimeUsage;
  if (entitlement === "paid") {
    const receipt: GrinLifetimeReceipt = {
      operationId,
      family: GRIN_USAGE_COLLECTION,
      recordId: params.recordId,
      acceptedAt: params.nowMs,
      committed: true,
    };
    nextLifetime = {
      ...existingLifetime,
      admissionReceipts: {
        ...existingLifetime.admissionReceipts,
        [operationId]: receipt,
      },
    };
  } else {
    if (
      existingLifetime.lifetimeAcceptedCount >= FREE_LIFETIME_RECORD_LIMIT ||
      existingLifetime.freeMembershipIds.length >= FREE_LIFETIME_RECORD_LIMIT
    ) {
      return {
        kind: "quota_exhausted",
        recordsThisMonth: existingLifetime.lifetimeAcceptedCount,
        cap: FREE_LIFETIME_RECORD_LIMIT,
        monthKey: istMonthKeyForMillis(params.nowMs),
        reason: "lifetime_exhausted",
      };
    }
    const receipt: GrinLifetimeReceipt = {
      operationId,
      family: GRIN_USAGE_COLLECTION,
      recordId: params.recordId,
      acceptedAt: params.nowMs,
      committed: true,
    };
    nextLifetime = {
      lifetimeAcceptedCount: existingLifetime.lifetimeAcceptedCount + 1,
      freeMembershipIds: [...existingLifetime.freeMembershipIds, params.recordId],
      admissionReceipts: {
        ...existingLifetime.admissionReceipts,
        [operationId]: receipt,
      },
    };
  }

  const statusCap = monthlyRecordCapFromStatusData(params.statusData ?? {});
  // Free lifetime does not gate on the legacy monthly 25. Starter keeps 100.
  const monthlyCap =
    entitlement === "paid" && statusCap === STARTER_MONTHLY_RECORD_CAP
      ? STARTER_MONTHLY_RECORD_CAP
      : UNLIMITED_MONTHLY_RECORD_CAP;

  const monthlyExisting =
    monthly && !("malformed" in monthly) ? monthly : null;
  const monthlyWrite = nextGrinUsageWrite({
    existing: monthlyExisting,
    monthKey: istMonthKeyForMillis(params.nowMs),
    cap: monthlyCap,
    recordId: params.recordId,
    updatedAt: params.nowMs,
  });
  if (monthlyWrite.kind === "quota_exhausted") {
    return monthlyWrite;
  }

  return {
    kind: "write",
    doc: {
      ...monthlyWrite.doc,
      lifetimeAcceptedCount: nextLifetime.lifetimeAcceptedCount,
      freeMembershipIds: [...nextLifetime.freeMembershipIds],
      admissionReceipts: { ...nextLifetime.admissionReceipts },
    },
  };
}
