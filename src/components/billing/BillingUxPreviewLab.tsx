import React, { useMemo, useState } from "react";
import { Pressable, StyleSheet } from "react-native";

import { Header, LocaleUiText, Screen } from "@/components/ui";
import { useI18n, useT } from "@/i18n";
import { spacing, typography, useThemedStyles } from "@/theme";

import { BenefitEducationScreen } from "./BenefitEducationScreen";
import { isBillingUxPreviewEnabled } from "./billingUxPreviewGate";
import {
  BILLING_UX_PREVIEW_ERROR,
  BILLING_UX_PREVIEW_TRIGGERS,
  fixtureLoadingOffers,
  fixtureReadyOffers,
  fixtureUnavailableOffers,
} from "./billingUxPreviewFixtures";
import { CLIENT_MANUAL_TRIAL_START_SUPPORTED } from "./upgradePresentation";
import { UpgradeSheet } from "./UpgradeSheet";
import type {
  TranslateFn,
  UpgradeCatalogState,
  UpgradeOperationState,
  UpgradePlanOffer,
  UpgradeTriggerContext,
} from "./upgradeTypes";

type LabSurface = "hub" | "education";

/**
 * Development presentation lab. Callbacks never reach IAP or quota code.
 */
export function BillingUxPreviewLab({ onLeave }: { onLeave: () => void }) {
  const t = useT();
  const { lang, setLang } = useI18n();
  const styles = usePreviewLabStyles();
  const [surface, setSurface] = useState<LabSurface>("hub");
  const [sheetVisible, setSheetVisible] = useState(false);
  const [triggerContext, setTriggerContext] = useState<UpgradeTriggerContext>("manualUpgrade");
  const [catalogState, setCatalogState] = useState<UpgradeCatalogState>("ready");
  const [trialEligible, setTrialEligible] = useState(false);
  const [trialActionAvailable, setTrialActionAvailable] = useState(
    CLIENT_MANUAL_TRIAL_START_SUPPORTED
  );
  const [lastPreviewAction, setLastPreviewAction] = useState("none");
  const [purchaseState, setPurchaseState] = useState<UpgradeOperationState>("idle");
  const [restoreState, setRestoreState] = useState<UpgradeOperationState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedSku, setSelectedSku] = useState<string | null>("vyd_starter_monthly");
  const [selectedPeriod, setSelectedPeriod] = useState<UpgradePlanOffer["period"]>("monthly");
  const [reducedMotion, setReducedMotion] = useState(false);

  const offers = useMemo(() => {
    if (catalogState === "loading") return fixtureLoadingOffers();
    if (catalogState === "unavailable") return fixtureUnavailableOffers();
    return fixtureReadyOffers();
  }, [catalogState]);

  if (!isBillingUxPreviewEnabled()) return null;

  const openSheet = (next: UpgradeTriggerContext) => {
    setTriggerContext(next);
    setSheetVisible(true);
  };

  if (surface === "education") {
    return (
      <BenefitEducationScreen
        reducedMotion={reducedMotion}
        onClose={() => setSurface("hub")}
        onContinue={() => {
          setSurface("hub");
          openSheet("manualUpgrade");
        }}
      />
    );
  }

  return (
    <Screen scroll padded>
      <Header
        variant="executive"
        title={t("billing.preview.title")}
        showBack
        onBackPress={onLeave}
      />
      <LocaleUiText style={styles.lead}>{t("billing.preview.subtitle")}</LocaleUiText>
      <LocaleUiText style={styles.note}>{t("billing.preview.note")}</LocaleUiText>

      <LabButton
        styles={styles}
        label={t("billing.preview.openEducation")}
        onPress={() => setSurface("education")}
      />
      {BILLING_UX_PREVIEW_TRIGGERS.map((trigger) => (
        <LabButton
          key={trigger}
          styles={styles}
          label={previewTriggerLabel(t, trigger)}
          onPress={() => {
            setCatalogState("ready");
            setPurchaseState("idle");
            setRestoreState("idle");
            setErrorMessage(null);
            openSheet(trigger);
          }}
        />
      ))}
      <LabButton
        styles={styles}
        label={t("billing.preview.catalogLoading")}
        onPress={() => {
          setCatalogState("loading");
          setPurchaseState("idle");
          setRestoreState("idle");
          setErrorMessage(null);
          openSheet("manualUpgrade");
        }}
      />
      <LabButton
        styles={styles}
        label={t("billing.preview.catalogUnavailable")}
        onPress={() => {
          setCatalogState("unavailable");
          setPurchaseState("idle");
          setRestoreState("idle");
          setErrorMessage(null);
          openSheet("manualUpgrade");
        }}
      />
      <LabButton
        styles={styles}
        label={t("billing.preview.purchasePending")}
        onPress={() => {
          setCatalogState("ready");
          setPurchaseState("pending");
          setErrorMessage(null);
          openSheet("manualUpgrade");
        }}
      />
      <LabButton
        styles={styles}
        label={t("billing.preview.purchaseError")}
        onPress={() => {
          setCatalogState("ready");
          setPurchaseState("idle");
          setErrorMessage(BILLING_UX_PREVIEW_ERROR);
          openSheet("manualUpgrade");
        }}
      />
      <LabButton
        styles={styles}
        label={trialEligible ? t("billing.preview.trialOff") : t("billing.preview.trialOn")}
        onPress={() => setTrialEligible((value) => !value)}
      />
      <LabButton
        styles={styles}
        label={
          trialActionAvailable ? t("billing.preview.trialActionOff") : t("billing.preview.trialActionOn")
        }
        onPress={() => setTrialActionAvailable((value) => !value)}
      />
      <LocaleUiText style={styles.note}>
        {t("billing.preview.lastAction", { action: lastPreviewAction })}
      </LocaleUiText>
      <LabButton
        styles={styles}
        label={lang === "hi" ? t("language.en") : t("language.hi")}
        onPress={() => setLang(lang === "hi" ? "en" : "hi")}
      />
      <LabButton
        styles={styles}
        label={reducedMotion ? t("billing.preview.motionOn") : t("billing.preview.motionOff")}
        onPress={() => setReducedMotion((value) => !value)}
      />

      <UpgradeSheet
        visible={sheetVisible}
        triggerContext={triggerContext}
        currentPlanLabel="Free"
        entitlementLabel="25 records / month (preview)"
        trialEligible={trialEligible}
        trialActionAvailable={trialActionAvailable}
        offers={offers}
        catalogState={catalogState}
        purchaseAvailable={catalogState === "ready"}
        restoreAvailable={catalogState === "ready"}
        purchaseState={purchaseState}
        restoreState={restoreState}
        errorMessage={errorMessage}
        selectedSku={selectedSku}
        selectedPeriod={selectedPeriod}
        onSelectSku={setSelectedSku}
        onSelectPeriod={setSelectedPeriod}
        onPurchase={(sku) => {
          setLastPreviewAction(`purchase:${sku}`);
          setPurchaseState("pending");
          setErrorMessage(BILLING_UX_PREVIEW_ERROR);
        }}
        onStartTrial={() => {
          setLastPreviewAction("trial");
        }}
        onRestore={() => {
          setLastPreviewAction("restore");
          setRestoreState("pending");
          setErrorMessage(BILLING_UX_PREVIEW_ERROR);
        }}
        onDismiss={() => {
          setSheetVisible(false);
          setPurchaseState("idle");
          setRestoreState("idle");
          setErrorMessage(null);
        }}
        onOpenBenefitEducation={() => {
          setSheetVisible(false);
          setSurface("education");
        }}
      />
    </Screen>
  );
}

function previewTriggerLabel(t: TranslateFn, trigger: UpgradeTriggerContext): string {
  switch (trigger) {
    case "recordLimitReached":
      return t("billing.preview.sheetRecordLimit");
    case "featureLocked":
      return t("billing.preview.sheetFeature");
    case "trialExpiring":
      return t("billing.preview.sheetTrial");
    case "manualUpgrade":
      return t("billing.preview.sheetManual");
  }
}

function usePreviewLabStyles() {
  return useThemedStyles((c) =>
    StyleSheet.create({
      lead: {
        ...typography.body,
        color: c.text,
        marginBottom: spacing.sm,
      },
      note: {
        ...typography.caption,
        color: c.textMuted,
        marginBottom: spacing.lg,
      },
      btn: {
        minHeight: 48,
        borderRadius: 12,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: c.divider,
        backgroundColor: c.surface,
        justifyContent: "center",
        paddingHorizontal: spacing.md,
        marginBottom: spacing.sm,
      },
      btnLabel: {
        ...typography.bodyStrong,
        color: c.text,
      },
      pressed: {
        opacity: 0.7,
      },
    })
  );
}

function LabButton({
  label,
  onPress,
  styles,
}: {
  label: string;
  onPress: () => void;
  styles: ReturnType<typeof usePreviewLabStyles>;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.btn, pressed && styles.pressed]}
    >
      <LocaleUiText style={styles.btnLabel}>{label}</LocaleUiText>
    </Pressable>
  );
}
