/**
 * Sanitize owner-readable billing history docs for UI. Never surface
 * credentials, tokens, GSTIN, or ledger internals.
 */

export const BILLING_HISTORY_EVENT_TYPES = [
  "trialStarted",
  "trialEnded",
  "purchaseActivated",
  "renewed",
  "graceEntered",
  "onHoldEntered",
  "cancelled",
  "resubscribed",
  "planChanged",
  "expired",
  "refunded",
] as const;

export type BillingHistoryEventType = (typeof BILLING_HISTORY_EVENT_TYPES)[number];

export interface SanitizedBillingHistoryRow {
  id: string;
  type: BillingHistoryEventType;
  occurredAt: number;
  planAfter: string | null;
  canonicalSku: string | null;
  amountInPaise: number | null;
  currency: "INR" | null;
  taxDocumentNumber: string | null;
}

const TYPE_SET = new Set<string>(BILLING_HISTORY_EVENT_TYPES);

export function billingHistoryTypeCopyKey(type: BillingHistoryEventType): string {
  return `billing.management.historyType.${type}`;
}

export function formatHistoryAmountInr(amountInPaise: number | null): string | null {
  if (amountInPaise == null || !Number.isFinite(amountInPaise)) return null;
  return `₹${(amountInPaise / 100).toFixed(2)}`;
}

export function parseBillingHistoryDoc(
  id: string,
  data: unknown
): SanitizedBillingHistoryRow | null {
  if (!data || typeof data !== "object") return null;
  const row = data as Record<string, unknown>;
  const type = typeof row.type === "string" && TYPE_SET.has(row.type) ? row.type : null;
  const occurredAt = typeof row.occurredAt === "number" ? row.occurredAt : null;
  if (!type || occurredAt == null) return null;
  const amount =
    typeof row.amountInPaise === "number" && Number.isFinite(row.amountInPaise)
      ? row.amountInPaise
      : null;
  const taxDocumentNumber =
    typeof row.taxDocumentNumber === "string" && row.taxDocumentNumber.trim()
      ? row.taxDocumentNumber.trim()
      : null;
  return {
    id,
    type: type as BillingHistoryEventType,
    occurredAt,
    planAfter: typeof row.planAfter === "string" ? row.planAfter : null,
    canonicalSku: typeof row.canonicalSku === "string" ? row.canonicalSku : null,
    amountInPaise: amount,
    currency: row.currency === "INR" ? "INR" : null,
    taxDocumentNumber,
  };
}
