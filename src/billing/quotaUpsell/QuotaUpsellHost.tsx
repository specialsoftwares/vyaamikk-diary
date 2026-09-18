/**
 * Shared UpgradeSheet host for ordinary-family quota_exhausted.
 *
 * Uses the existing IapProvider / SubscriptionProvider. Does not start a
 * second purchase listener, write entitlements, or auto-retry the save.
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";

import { useIap } from "@/billing/iap";
import { UpgradeSheet } from "@/components/billing/UpgradeSheet";
import { BenefitEducationScreen } from "@/components/billing/BenefitEducationScreen";
import { useT } from "@/i18n";
import { useSubscription } from "@/subscription";
import type { UpgradeCatalogPeriod } from "@/components/billing/upgradeTypes";

import { createQuotaUpsellController, type QuotaUpsellController } from "./quotaUpsellController";
import { mapUpgradeSheetModel } from "./mapUpgradeSheetModel";
import { registerQuotaUpsellPresenter } from "./notifyOrdinaryQuotaUpsell";
import type { QuotaUpsellRequest } from "./quotaUpsellTypes";

export function QuotaUpsellHost({ children }: { children: React.ReactNode }) {
  const t = useT();
  const iap = useIap();
  const { purchase, restorePurchases, loadCatalog, available } = iap;
  const subscription = useSubscription();
  const [tick, setTick] = useState(0);
  const [educationOpen, setEducationOpen] = useState(false);
  const [selectedSku, setSelectedSku] = useState<string | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState<UpgradeCatalogPeriod>("monthly");

  const controller = useMemo<QuotaUpsellController>(
    () =>
      createQuotaUpsellController({
        purchase,
        restorePurchases,
      }),
    [purchase, restorePurchases]
  );

  useEffect(() => {
    registerQuotaUpsellPresenter((request: QuotaUpsellRequest) => {
      const result = controller.present(request);
      setTick((n) => n + 1);
      return result;
    });
    return () => {
      registerQuotaUpsellPresenter(null);
    };
  }, [controller]);

  const snapshot = controller.snapshot();
  const model = mapUpgradeSheetModel({
    t,
    iap,
    subscription,
    hostPurchaseState: snapshot.hostPurchaseState,
    hostRestoreState: snapshot.hostRestoreState,
    hostErrorMessage: snapshot.hostErrorMessage,
  });

  useEffect(() => {
    if (!snapshot.visible) return;
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
      void controller.purchase(sku).then(() => setTick((n) => n + 1));
    },
    [controller]
  );
  const onRestore = useCallback(() => {
    void controller.restore().then(() => setTick((n) => n + 1));
  }, [controller]);
  const onDismiss = useCallback(() => {
    controller.dismiss();
    setEducationOpen(false);
    setSelectedSku(null);
    setTick((n) => n + 1);
  }, [controller]);
  const onStartTrial = useCallback(() => {
    controller.startTrial();
  }, [controller]);

  void tick;

  return (
    <>
      {children}
      <UpgradeSheet
        visible={snapshot.visible && !educationOpen}
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
        selectedSku={selectedSku}
        selectedPeriod={selectedPeriod}
        onSelectSku={setSelectedSku}
        onSelectPeriod={setSelectedPeriod}
        onPurchase={onPurchase}
        onStartTrial={onStartTrial}
        onRestore={onRestore}
        onDismiss={onDismiss}
        onOpenBenefitEducation={() => setEducationOpen(true)}
      />
      {educationOpen ? (
        <BenefitEducationScreen
          reducedMotion={false}
          onContinue={() => setEducationOpen(false)}
          onClose={() => setEducationOpen(false)}
        />
      ) : null}
    </>
  );
}
