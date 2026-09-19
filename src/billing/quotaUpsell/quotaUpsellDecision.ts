import { classifyAtomicCreateError } from "@/billing/optionC/classifyCreateError";
import { syncSessionOwnership } from "@/sync/syncSessionOwnership";

import { isQuotaUpsellEnabled } from "./quotaUpsellGate";
import {
  ORDINARY_QUOTA_FAMILIES,
  QUOTA_EXEMPT_FAMILIES,
  type OrdinaryQuotaFamily,
  type QuotaUpsellDecision,
  type QuotaUpsellFamily,
  type QuotaUpsellRequest,
} from "./quotaUpsellTypes";

const ORDINARY = new Set<string>(ORDINARY_QUOTA_FAMILIES);
const EXEMPT = new Set<string>(QUOTA_EXEMPT_FAMILIES);

export function isOrdinaryQuotaFamily(family: QuotaUpsellFamily): family is OrdinaryQuotaFamily {
  return ORDINARY.has(family);
}

export function isQuotaExemptFamily(family: QuotaUpsellFamily): boolean {
  return EXEMPT.has(family);
}

export function resolveQuotaFailureKind(
  request: Pick<QuotaUpsellRequest, "failureKind" | "error">
): string | null {
  if (request.failureKind) return request.failureKind;
  if (request.error != null) return classifyAtomicCreateError(request.error);
  return null;
}

/**
 * Pure eligibility: ordinary-family quota_exhausted from the live user-save
 * session, with the integration gate on. Host still admits visibility/dedupe.
 */
export function decideQuotaUpsellEligibility(request: QuotaUpsellRequest): QuotaUpsellDecision {
  if (!isQuotaUpsellEnabled()) return { ok: false, reason: "gate_off" };
  if (request.origin !== "user_save") return { ok: false, reason: "background_origin" };
  if (isQuotaExemptFamily(request.family)) return { ok: false, reason: "exempt_family" };
  if (!isOrdinaryQuotaFamily(request.family)) return { ok: false, reason: "unknown_family" };
  const kind = resolveQuotaFailureKind(request);
  if (kind !== "quota_exhausted") return { ok: false, reason: "not_quota_exhausted" };
  const id = typeof request.clientRecordId === "string" ? request.clientRecordId.trim() : "";
  if (!id) return { ok: false, reason: "missing_record_id" };
  if (!syncSessionOwnership.isCurrent(request.session)) {
    return { ok: false, reason: "session_stale" };
  }
  return { ok: true };
}
