import { isSubscriptionPurchaseEntryEnabled } from "@/billing/iap/purchaseEntryGate";
import type { SyncSessionToken } from "@/sync/syncSessionOwnership";

import { decideQuotaUpsellEligibility } from "./quotaUpsellDecision";
import type { QuotaUpsellPresentResult } from "./quotaUpsellController";
import type { QuotaUpsellRequest } from "./quotaUpsellTypes";

type Presenter = (request: QuotaUpsellRequest) => QuotaUpsellPresentResult;
type ManualPresenter = (session: SyncSessionToken | null) => QuotaUpsellPresentResult;

let presenter: Presenter | null = null;
let manualPresenter: ManualPresenter | null = null;

export function registerQuotaUpsellPresenter(next: Presenter | null): void {
  presenter = next;
}

export function registerManualUpgradePresenter(next: ManualPresenter | null): void {
  manualPresenter = next;
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

/**
 * Settings / management entry. Independent of the quota upsell gate and
 * does not invent a record id. Reuses the same UpgradeSheet host.
 */
export function notifyManualUpgrade(session: SyncSessionToken | null): QuotaUpsellPresentResult {
  if (!isSubscriptionPurchaseEntryEnabled()) {
    return { ok: false, reason: "purchase_entry_closed", visible: false, clientRecordId: null };
  }
  if (!manualPresenter) {
    return { ok: false, reason: "no_host", visible: false, clientRecordId: null };
  }
  return manualPresenter(session);
}
