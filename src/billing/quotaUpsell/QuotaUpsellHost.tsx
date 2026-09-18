/**
 * Shared UpgradeSheet host for ordinary-family quota_exhausted.
 *
 * Uses the existing IapProvider / SubscriptionProvider. Does not start a
 * second purchase listener, write entitlements, or auto-retry the save.
 * Presentation visibility is owned by the session-bound host runtime.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useIap } from "@/billing/iap";
import { UpgradeSheet } from "@/components/billing/UpgradeSheet";
import { BenefitEducationScreen } from "@/components/billing/BenefitEducationScreen";
import { useT } from "@/i18n";
import { useAuth } from "@/state/auth";
import { useSubscription } from "@/subscription";
import type { UpgradeCatalogPeriod } from "@/components/billing/upgradeTypes";

import { mapUpgradeSheetModel } from "./mapUpgradeSheetModel";
import { createQuotaUpsellHostRuntime } from "./quotaUpsellHostRuntime";

export function QuotaUpsellHost({ children }: { children: React.ReactNode }) {
  const t = useT();
  const { status: authStatus, user } = useAuth();
  const iap = useIap();
  const { purchase, restorePurchases, loadCatalog, available } = iap;
  const subscription = useSubscription();
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
    user?.uid,
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
      <UpgradeSheet
        visible={sheetVisible}
        triggerContext={model.triggerContext}
        currentPlanLabel={model.currentPlanLabel}
        entitlementLabel={model.entitlementLabel}
        trialEligible={model.trialEligible}
        trialActionAvailable={model.trialActionAvailable}
        offers={model.offers}
        catalogState={model.catalogState}
        purchaseAvailable={model.purchaseAvailable}
        restoreAvailable={model.restoreAvailable}
        purchaseState={model.purchaseState}
        restoreState={model.restoreState}
        errorMessage={model.errorMessage}
        errorRetryEnabled={model.errorRetryEnabled}
        selectedSku={selectedSku}
        selectedPeriod={selectedPeriod}
        onSelectSku={setSelectedSku}
        onSelectPeriod={setSelectedPeriod}
        onPurchase={onPurchase}
        onStartTrial={onStartTrial}
        onRestore={onRestore}
        onDismiss={onDismiss}
        onOpenBenefitEducation={() => runtime.openEducation()}
      />
      {snapshot.educationOpen ? (
        <BenefitEducationScreen
          reducedMotion={false}
          onContinue={() => runtime.closeEducation()}
          onClose={() => runtime.closeEducation()}
        />
      ) : null}
    </>
  );
}
