/**
 * Production quota-upsell host runtime.
 *
 * QuotaUpsellHost and lifecycle tests share this adapter: session-bound
 * controller, notify presenter, and IAP view reconciliation. Provider,
 * store, and backend boundaries are injected. No entitlement writes.
 */

import type { CanonicalSku, IapView, PurchaseFlowResult } from "@/billing/iap/iapTypes";
import { isSubscriptionPurchaseEntryEnabled } from "@/billing/iap/purchaseEntryGate";

import {
  createQuotaUpsellController,
  type QuotaUpsellActionResult,
  type QuotaUpsellController,
  type QuotaUpsellIapSlice,
  type QuotaUpsellPresentResult,
  type QuotaUpsellSnapshot,
} from "./quotaUpsellController";
import {
  registerManualUpgradePresenter,
  registerQuotaUpsellPresenter,
} from "./notifyOrdinaryQuotaUpsell";
import type { QuotaUpsellRequest } from "./quotaUpsellTypes";
import type { SyncSessionToken } from "@/sync/syncSessionOwnership";

export type QuotaUpsellHostRuntimeDeps = {
  purchase: (sku: CanonicalSku) => Promise<PurchaseFlowResult>;
  restorePurchases: () => Promise<PurchaseFlowResult>;
  getIap: () => QuotaUpsellIapSlice;
};

export type QuotaUpsellHostRuntime = {
  controller: QuotaUpsellController;
  attach(): void;
  reconcile(): void;
  snapshot(): QuotaUpsellSnapshot;
  present(request: QuotaUpsellRequest): QuotaUpsellPresentResult;
  presentManual(session: SyncSessionToken | null): QuotaUpsellPresentResult;
  dismiss(): void;
  purchase(sku: string): Promise<QuotaUpsellActionResult>;
  restore(): Promise<QuotaUpsellActionResult>;
  startTrial(): QuotaUpsellActionResult;
  openEducation(): void;
  closeEducation(): void;
  subscribe(listener: () => void): () => void;
  dispose(): void;
};

export function iapSlice(view: Pick<IapView, keyof QuotaUpsellIapSlice>): QuotaUpsellIapSlice {
  return {
    available: view.available,
    pending: view.pending,
    purchaseInFlight: view.purchaseInFlight,
    lastResult: view.lastResult,
  };
}

export function createQuotaUpsellHostRuntime(
  deps: QuotaUpsellHostRuntimeDeps
): QuotaUpsellHostRuntime {
  const controller = createQuotaUpsellController({
    purchase: deps.purchase,
    restorePurchases: deps.restorePurchases,
  });
  const listeners = new Set<() => void>();

  function emit(): void {
    for (const listener of listeners) listener();
  }

  function reconcile(): void {
    controller.sync(deps.getIap());
    emit();
  }

  function present(request: QuotaUpsellRequest): QuotaUpsellPresentResult {
    controller.sync(deps.getIap());
    const result = controller.present(request);
    emit();
    return result;
  }

  function presentManual(session: SyncSessionToken | null): QuotaUpsellPresentResult {
    controller.sync(deps.getIap());
    if (!isSubscriptionPurchaseEntryEnabled()) {
      emit();
      return {
        ok: false,
        reason: "purchase_entry_closed",
        visible: false,
        clientRecordId: null,
      };
    }
    const result = controller.presentManual(session);
    emit();
    return result;
  }

  return {
    controller,
    attach() {
      registerQuotaUpsellPresenter(present);
      registerManualUpgradePresenter(presentManual);
    },
    reconcile,
    snapshot() {
      return controller.snapshot();
    },
    present,
    presentManual,
    dismiss() {
      controller.dismiss();
      emit();
    },
    async purchase(sku) {
      const op = controller.purchase(sku);
      emit();
      try {
        return await op;
      } finally {
        emit();
      }
    },
    async restore() {
      const op = controller.restore();
      emit();
      try {
        return await op;
      } finally {
        emit();
      }
    },
    startTrial() {
      const result = controller.startTrial();
      emit();
      return result;
    },
    openEducation() {
      controller.openEducation();
      emit();
    },
    closeEducation() {
      controller.closeEducation();
      emit();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    dispose() {
      registerQuotaUpsellPresenter(null);
      registerManualUpgradePresenter(null);
      listeners.clear();
    },
  };
}
