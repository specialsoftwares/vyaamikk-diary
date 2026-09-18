/**
 * Session-bound quota upsell controller.
 *
 * Presentation-only: purchase/restore go to the existing IAP callbacks.
 * A purchase result never writes entitlement. Trial start is unsupported.
 */

import type { CanonicalSku, PurchaseFlowResult } from "@/billing/iap/iapTypes";
import type { UpgradeOperationState } from "@/components/billing/upgradeTypes";
import { syncSessionOwnership, type SyncSessionToken } from "@/sync/syncSessionOwnership";

import { decideQuotaUpsellEligibility } from "./quotaUpsellDecision";
import { asCanonicalPurchaseSku } from "./mapUpgradeSheetModel";
import type { QuotaUpsellDecision, QuotaUpsellRequest } from "./quotaUpsellTypes";

export type QuotaUpsellPresentResult = QuotaUpsellDecision & {
  visible: boolean;
  clientRecordId: string | null;
};

export type QuotaUpsellActionResult =
  | PurchaseFlowResult
  | { kind: "ignored_stale" }
  | { kind: "blocked_busy" }
  | { kind: "unsupported" }
  | { kind: "invalid_sku" };

export interface QuotaUpsellControllerDeps {
  purchase: (sku: CanonicalSku) => Promise<PurchaseFlowResult>;
  restorePurchases: () => Promise<PurchaseFlowResult>;
}

export interface QuotaUpsellController {
  present(request: QuotaUpsellRequest): QuotaUpsellPresentResult;
  dismiss(): void;
  purchase(sku: string): Promise<QuotaUpsellActionResult>;
  restore(): Promise<QuotaUpsellActionResult>;
  startTrial(): QuotaUpsellActionResult;
  snapshot(): {
    visible: boolean;
    clientRecordId: string | null;
    session: SyncSessionToken | null;
    hostPurchaseState: UpgradeOperationState;
    hostRestoreState: UpgradeOperationState;
    inFlightKind: "purchase" | "restore" | null;
    hostErrorMessage: string | null;
    purchaseCalls: CanonicalSku[];
    restoreCalls: number;
    trialCalls: number;
  };
}

function isBusy(state: UpgradeOperationState): boolean {
  return state === "loading" || state === "pending";
}

function hostStateFromResult(result: PurchaseFlowResult): UpgradeOperationState {
  if (result.kind === "store_pending" || result.kind === "verified_unfinished_ios") return "pending";
  if (result.kind === "unavailable") return "unavailable";
  if (result.kind === "already_in_flight") return "loading";
  return "idle";
}

export function createQuotaUpsellController(
  deps: QuotaUpsellControllerDeps
): QuotaUpsellController {
  let visible = false;
  let clientRecordId: string | null = null;
  let session: SyncSessionToken | null = null;
  let hostPurchaseState: UpgradeOperationState = "idle";
  let hostRestoreState: UpgradeOperationState = "idle";
  let inFlightKind: "purchase" | "restore" | null = null;
  let hostErrorMessage: string | null = null;
  const purchaseCalls: CanonicalSku[] = [];
  let restoreCalls = 0;
  let trialCalls = 0;

  function stillOwnsSheet(): boolean {
    return visible && syncSessionOwnership.isCurrent(session);
  }

  return {
    present(request) {
      const eligibility = decideQuotaUpsellEligibility(request);
      if (!eligibility.ok) {
        return { ...eligibility, visible, clientRecordId };
      }
      const id = request.clientRecordId as string;
      if (visible && clientRecordId === id) {
        return { ok: false, reason: "sheet_already_visible", visible, clientRecordId };
      }
      if (visible && clientRecordId !== id) {
        return { ok: false, reason: "other_sheet_visible", visible, clientRecordId };
      }
      visible = true;
      clientRecordId = id;
      session = request.session;
      hostErrorMessage = null;
      return { ok: true, visible, clientRecordId };
    },

    dismiss() {
      visible = false;
      hostPurchaseState = "idle";
      hostRestoreState = "idle";
      inFlightKind = null;
      hostErrorMessage = null;
      // Keep clientRecordId for diagnostics; do not recreate a record.
    },

    async purchase(sku) {
      if (!stillOwnsSheet()) return { kind: "ignored_stale" };
      if (isBusy(hostPurchaseState) || isBusy(hostRestoreState) || inFlightKind) {
        return { kind: "blocked_busy" };
      }
      const canonical = asCanonicalPurchaseSku(sku);
      if (!canonical) return { kind: "invalid_sku" };
      const owner = session;
      inFlightKind = "purchase";
      hostPurchaseState = "loading";
      hostErrorMessage = null;
      purchaseCalls.push(canonical);
      const result = await deps.purchase(canonical);
      if (!syncSessionOwnership.isCurrent(owner)) {
        inFlightKind = null;
        hostPurchaseState = "idle";
        return { kind: "ignored_stale" };
      }
      inFlightKind = result.kind === "already_in_flight" ? "purchase" : null;
      hostPurchaseState = hostStateFromResult(result);
      hostErrorMessage = result.kind === "failed" ? result.message : null;
      return result;
    },

    async restore() {
      if (!stillOwnsSheet()) return { kind: "ignored_stale" };
      if (isBusy(hostPurchaseState) || isBusy(hostRestoreState) || inFlightKind) {
        return { kind: "blocked_busy" };
      }
      const owner = session;
      inFlightKind = "restore";
      hostRestoreState = "loading";
      hostErrorMessage = null;
      restoreCalls += 1;
      const result = await deps.restorePurchases();
      if (!syncSessionOwnership.isCurrent(owner)) {
        inFlightKind = null;
        hostRestoreState = "idle";
        return { kind: "ignored_stale" };
      }
      inFlightKind = result.kind === "already_in_flight" ? "restore" : null;
      hostRestoreState = hostStateFromResult(result);
      hostErrorMessage = result.kind === "failed" ? result.message : null;
      return result;
    },

    startTrial() {
      trialCalls += 1;
      return { kind: "unsupported" };
    },

    snapshot() {
      return {
        visible,
        clientRecordId,
        session,
        hostPurchaseState,
        hostRestoreState,
        inFlightKind,
        hostErrorMessage,
        purchaseCalls: [...purchaseCalls],
        restoreCalls,
        trialCalls,
      };
    },
  };
}
