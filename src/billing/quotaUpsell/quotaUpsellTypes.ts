import type { AtomicCreateFailureKind } from "@/billing/optionC/classifyCreateError";
import type { SyncSessionToken } from "@/sync/syncSessionOwnership";

/** Ordinary families that consume monthly billable-record quota. */
export const ORDINARY_QUOTA_FAMILIES = [
  "diary",
  "purchase_order",
  "customer_credit",
  "professional_pack",
] as const;

export type OrdinaryQuotaFamily = (typeof ORDINARY_QUOTA_FAMILIES)[number];

/** Known production families that must never open the quota upsell. */
export const QUOTA_EXEMPT_FAMILIES = ["letterhead", "letterhead_matter"] as const;

export type QuotaExemptFamily = (typeof QUOTA_EXEMPT_FAMILIES)[number];

export type QuotaUpsellFamily = OrdinaryQuotaFamily | QuotaExemptFamily | "unknown";

export type QuotaUpsellOrigin = "user_save" | "background_sync";

export type QuotaUpsellDenyReason =
  | "gate_off"
  | "not_quota_exhausted"
  | "exempt_family"
  | "unknown_family"
  | "background_origin"
  | "missing_record_id"
  | "session_stale"
  | "no_host"
  | "sheet_already_visible"
  | "other_sheet_visible"
  | "purchase_entry_closed";

export interface QuotaUpsellRequest {
  family: QuotaUpsellFamily;
  origin: QuotaUpsellOrigin;
  clientRecordId: string | null | undefined;
  session: SyncSessionToken | null;
  failureKind?: AtomicCreateFailureKind | null;
  error?: unknown;
}

export type QuotaUpsellDecision =
  | { ok: true }
  | { ok: false; reason: QuotaUpsellDenyReason };
