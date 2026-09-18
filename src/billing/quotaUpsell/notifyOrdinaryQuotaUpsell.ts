import { decideQuotaUpsellEligibility } from "./quotaUpsellDecision";
import type { QuotaUpsellPresentResult } from "./quotaUpsellController";
import type { QuotaUpsellRequest } from "./quotaUpsellTypes";

type Presenter = (request: QuotaUpsellRequest) => QuotaUpsellPresentResult;

let presenter: Presenter | null = null;

export function registerQuotaUpsellPresenter(next: Presenter | null): void {
  presenter = next;
}

/**
 * Production caller entry. Safe no-op when the host is unmounted or the gate
 * is off. Never opens from letterhead, background sync, or non-quota errors.
 */
export function notifyOrdinaryQuotaUpsell(request: QuotaUpsellRequest): QuotaUpsellPresentResult {
  const eligibility = decideQuotaUpsellEligibility(request);
  if (!eligibility.ok) {
    return { ...eligibility, visible: false, clientRecordId: request.clientRecordId ?? null };
  }
  if (!presenter) {
    return {
      ok: false,
      reason: "no_host",
      visible: false,
      clientRecordId: request.clientRecordId ?? null,
    };
  }
  return presenter(request);
}
