/**
 * Production quota-upsell host view.
 *
 * Provider hooks stay in QuotaUpsellHost. This view owns runtime attach,
 * session reconciliation, and sheet/education surfaces. Surfaces are injected
 * so Node tests can mount without react-native.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { UseIapResult } from "@/billing/iap";
import type {
  TranslateFn,
  UpgradeCatalogPeriod,
  UpgradeCatalogState,
  UpgradeOperationState,
  UpgradePlanOffer,
  UpgradeTriggerContext,
} from "@/components/billing/upgradeTypes";

import { mapUpgradeSheetModel, type QuotaUpsellSubscriptionSource } from "./mapUpgradeSheetModel";
import { createQuotaUpsellHostRuntime } from "./quotaUpsellHostRuntime";

export type QuotaUpsellEducationSurfaceProps = {
  open: boolean;
  onContinue: () => void;
  onClose: () => void;
};

export type QuotaUpsellSheetSurfaceProps = {
  visible: boolean;
  triggerContext: UpgradeTriggerContext;
  currentPlanLabel: string;
  entitlementLabel: string;
  trialEligible: boolean;
  trialActionAvailable: boolean;
  offers: readonly UpgradePlanOffer[];
  catalogState: UpgradeCatalogState;
  purchaseAvailable: boolean;
  restoreAvailable: boolean;
  purchaseState: UpgradeOperationState;
  restoreState: UpgradeOperationState;
  errorMessage: string | null;
  errorRetryEnabled?: boolean;
  selectedSku: string | null;
  selectedPeriod: UpgradeCatalogPeriod;
  onSelectSku: (sku: string) => void;
  onSelectPeriod: (period: UpgradeCatalogPeriod) => void;
  onPurchase: (sku: string) => void;
  onStartTrial: () => void;
  onRestore: () => void;
  onDismiss: () => void;
  onOpenBenefitEducation: () => void;
};

export type QuotaUpsellHostViewProps = {
  t: TranslateFn;
  authStatus: string;
  uid: string | null;
  iap: UseIapResult;
  subscription: QuotaUpsellSubscriptionSource;
  children?: React.ReactNode;
  renderSheet: (props: QuotaUpsellSheetSurfaceProps) => React.ReactNode;
  renderEducation: (props: QuotaUpsellEducationSurfaceProps) => React.ReactNode;
};

export function QuotaUpsellHostView({
  t,
  authStatus,
  uid,
  iap,
  subscription,
  children,
  renderSheet,
  renderEducation,
}: QuotaUpsellHostViewProps) {
  const { purchase, restorePurchases, loadCatalog, available } = iap;
  const [tick, setTick] = useState(0);
  const [selectedSku, setSelectedSku] = useState<string | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState<UpgradeCatalogPeriod>("monthly");
  const iapRef = useRef(iap);
  iapRef.current = iap;

  const runtime = useMemo(
    () =>
      createQuotaUpsellHostRuntime({
        purchase,
        restorePurchases,
        getIap: () => iapRef.current,
      }),
    [purchase, restorePurchases]
  );

  useEffect(() => {
    const stop = runtime.subscribe(() => setTick((n) => n + 1));
    runtime.attach();
    return () => {
      stop();
      runtime.dispose();
    };
  }, [runtime]);

  useEffect(() => {
    runtime.reconcile();
  }, [
    runtime,
    authStatus,
    uid,
    iap.available,
    iap.purchaseInFlight,
    iap.pending,
    iap.lastResult,
  ]);

  const snapshot = runtime.snapshot();
  const model = mapUpgradeSheetModel({
    t,
    iap,
    subscription,
    hostPurchaseState: snapshot.hostPurchaseState,
    hostRestoreState: snapshot.hostRestoreState,
    hostErrorMessage: snapshot.hostErrorMessage,
    errorRecoverable: snapshot.errorRecoverable,
    triggerContext: snapshot.triggerContext,
  });

  useEffect(() => {
    if (!snapshot.visible) {
      setSelectedSku(null);
      return;
    }
    if (selectedSku == null && model.defaultSku) {
      setSelectedSku(model.defaultSku);
      setSelectedPeriod(model.defaultPeriod);
    }
  }, [snapshot.visible, selectedSku, model.defaultSku, model.defaultPeriod]);

  useEffect(() => {
    if (snapshot.visible && available) {
      void loadCatalog();
    }
  }, [snapshot.visible, available, loadCatalog]);

  const onPurchase = useCallback(
    (sku: string) => {
      void runtime.purchase(sku).catch(() => undefined);
    },
    [runtime]
  );
  const onRestore = useCallback(() => {
    void runtime.restore().catch(() => undefined);
  }, [runtime]);
  const onDismiss = useCallback(() => {
    runtime.dismiss();
  }, [runtime]);
  const onStartTrial = useCallback(() => {
    runtime.startTrial();
  }, [runtime]);

  void tick;

  const sheetVisible = snapshot.visible && !snapshot.educationOpen;

  return (
    <>
      {children}
      {renderSheet({
        visible: sheetVisible,
        triggerContext: model.triggerContext,
        currentPlanLabel: model.currentPlanLabel,
        entitlementLabel: model.entitlementLabel,
        trialEligible: model.trialEligible,
        trialActionAvailable: model.trialActionAvailable,
        offers: model.offers,
        catalogState: model.catalogState,
        purchaseAvailable: model.purchaseAvailable,
        restoreAvailable: model.restoreAvailable,
        purchaseState: model.purchaseState,
        restoreState: model.restoreState,
        errorMessage: model.errorMessage,
        errorRetryEnabled: model.errorRetryEnabled,
        selectedSku,
        selectedPeriod,
        onSelectSku: setSelectedSku,
        onSelectPeriod: setSelectedPeriod,
        onPurchase,
        onStartTrial,
        onRestore,
        onDismiss,
        onOpenBenefitEducation: () => runtime.openEducation(),
      })}
      {renderEducation({
        open: snapshot.educationOpen,
        onContinue: () => runtime.closeEducation(),
        onClose: () => runtime.closeEducation(),
      })}
    </>
  );
}
