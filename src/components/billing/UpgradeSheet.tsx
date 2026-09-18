import React, { useMemo, useRef } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";

import { LocaleUiText } from "@/components/ui/LocaleUiText";
import {
  CurtainSheet,
  CURTAIN_SURFACE,
  type CurtainSheetHandle,
} from "@/components/ui/CurtainSheet";
import { BRAND_GOLD } from "@/config/brandMotion";
import { useT } from "@/i18n";
import { spacing, typography } from "@/theme";

import {
  buildUpgradePlanCards,
  canDispatchPurchase,
  canDispatchTrial,
  decideUpgradeSheetDispatch,
  defaultSelectedSku,
  planIdForSku,
  resolveUpgradeCta,
  restoreCtaLabel,
  selectedOfferIsReady,
  shouldShowTrustedByClaim,
  upgradePeriodLabel,
  upgradeTriggerCopy,
  UPGRADE_PERIOD_ORDER,
  type UpgradeCtaKind,
} from "./upgradePresentation";
import type {
  TranslateFn,
  UpgradeCatalogState,
  UpgradeOperationState,
  UpgradePlanOffer,
  UpgradeTriggerContext,
} from "./upgradeTypes";

function purchaseCtaLabel(t: TranslateFn, kind: UpgradeCtaKind): string {
  switch (kind) {
    case "trial":
      return t("billing.upgrade.ctaTrial");
    case "trialUnavailable":
      return t("billing.upgrade.ctaTrialUnavailable");
    case "subscribe":
      return t("billing.upgrade.ctaSubscribe");
    case "unavailable":
      return t("billing.upgrade.purchaseUnavailable");
    case "pending":
      return t("billing.upgrade.purchasePending");
    case "loading":
      return t("billing.upgrade.purchaseLoading");
  }
}

const CURTAIN_TEXT = "#F2F3F8";
const CURTAIN_TEXT_MUTED = "rgba(255,255,255,0.72)";
const CURTAIN_TEXT_SUBTLE = "rgba(255,255,255,0.48)";
const CURTAIN_DIVIDER = "rgba(255,255,255,0.1)";
const CARD_FILL = "rgba(255,255,255,0.06)";

export interface UpgradeSheetProps {
  visible: boolean;
  triggerContext: UpgradeTriggerContext;
  currentPlanLabel: string;
  entitlementLabel: string;
  trialEligible: boolean;
  /**
   * True only when a supported client trial-start exists.
   * The accepted backend grant is server-only; production callers must pass false.
   */
  trialActionAvailable: boolean;
  offers: readonly UpgradePlanOffer[];
  catalogState: UpgradeCatalogState;
  purchaseAvailable: boolean;
  restoreAvailable: boolean;
  purchaseState: UpgradeOperationState;
  restoreState: UpgradeOperationState;
  errorMessage: string | null;
  selectedSku: string | null;
  selectedPeriod: UpgradePlanOffer["period"];
  onSelectSku: (sku: string) => void;
  onSelectPeriod: (period: UpgradePlanOffer["period"]) => void;
  onPurchase: (sku: string) => void;
  /** Invoked only for a trial-labelled CTA. Must not purchase a store SKU. */
  onStartTrial: () => void;
  onRestore: () => void;
  onDismiss: () => void;
  onOpenBenefitEducation: () => void;
}

/**
 * Paywall curtain. Explicit inputs/callbacks only — no IAP controller,
 * subscription session, or auth session inside this file.
 */
export function UpgradeSheet({
  visible,
  triggerContext,
  currentPlanLabel,
  entitlementLabel,
  trialEligible,
  trialActionAvailable,
  offers,
  catalogState,
  purchaseAvailable,
  restoreAvailable,
  purchaseState,
  restoreState,
  errorMessage,
  selectedSku,
  selectedPeriod,
  onSelectSku,
  onSelectPeriod,
  onPurchase,
  onStartTrial,
  onRestore,
  onDismiss,
  onOpenBenefitEducation,
}: UpgradeSheetProps) {
  const t = useT();
  const curtainRef = useRef<CurtainSheetHandle>(null);
  const copy = upgradeTriggerCopy(t, triggerContext);
  const cards = useMemo(
    () => buildUpgradePlanCards(t, offers, selectedPeriod),
    [t, offers, selectedPeriod]
  );
  const resolvedSku = defaultSelectedSku(cards, selectedSku);
  const selectedPlanId = planIdForSku(offers, resolvedSku);
  const cta = resolveUpgradeCta({
    trialEligible,
    trialActionAvailable,
    selectedPlanId,
    purchaseAvailable,
    purchaseState,
    catalogState,
    hasError: Boolean(errorMessage),
  });
  const offerReady = selectedOfferIsReady(offers, resolvedSku);
  const purchaseEnabled = canDispatchPurchase({
    ctaEnabled: cta.enabled,
    dispatch: cta.dispatch,
    selectedSku: resolvedSku,
    selectedOfferReady: offerReady,
  });
  const trialEnabled = canDispatchTrial({
    ctaEnabled: cta.enabled,
    dispatch: cta.dispatch,
    trialActionAvailable,
  });
  const sheetDispatch = decideUpgradeSheetDispatch({
    purchaseEnabled,
    trialEnabled,
    restoreAvailable,
    purchaseState,
    restoreState,
    dispatch: cta.dispatch,
    selectedSku: resolvedSku,
  });
  const restoreLabel = restoreCtaLabel(t, { restoreAvailable, restoreState });

  const close = () => {
    if (curtainRef.current) {
      curtainRef.current.close();
      return;
    }
    onDismiss();
  };

  return (
    <CurtainSheet
      ref={curtainRef}
      visible={visible}
      onClose={onDismiss}
      closeOnBackdropPress={false}
      accessibilityLabel={copy.title}
      header={
        <View style={styles.sheetHeader}>
          <View style={styles.headerRow}>
            <LocaleUiText style={styles.sheetTitle} accessibilityRole="header">
              {copy.title}
            </LocaleUiText>
            <Pressable
              onPress={close}
              accessibilityRole="button"
              accessibilityLabel={t("billing.upgrade.close")}
              hitSlop={12}
              style={({ pressed }) => [styles.closeHit, pressed && styles.pressed]}
            >
              <LocaleUiText style={styles.closeMark}>×</LocaleUiText>
            </Pressable>
          </View>
          <LocaleUiText style={styles.sheetSubtitle}>{copy.subtitle}</LocaleUiText>
        </View>
      }
    >
      <View style={styles.sheetBody}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View
          style={styles.metaBlock}
          accessibilityLabel={`${t("billing.upgrade.currentPlan")}: ${currentPlanLabel}. ${t("billing.upgrade.entitlement")}: ${entitlementLabel}`}
        >
          <LocaleUiText style={styles.metaLabel}>{t("billing.upgrade.currentPlan")}</LocaleUiText>
          <LocaleUiText style={styles.metaValue}>{currentPlanLabel}</LocaleUiText>
          <LocaleUiText style={styles.metaLabel}>{t("billing.upgrade.entitlement")}</LocaleUiText>
          <LocaleUiText style={styles.metaValue}>{entitlementLabel}</LocaleUiText>
        </View>

        <Pressable
          onPress={onOpenBenefitEducation}
          accessibilityRole="button"
          accessibilityLabel={t("billing.upgrade.learnBenefits")}
          style={({ pressed }) => [styles.linkRow, pressed && styles.pressed]}
        >
          <LocaleUiText style={styles.linkText}>{t("billing.upgrade.learnBenefits")}</LocaleUiText>
        </Pressable>

        {shouldShowTrustedByClaim() ? (
          <LocaleUiText style={styles.trustClaim}>{t("billing.upgrade.trustedByClaim")}</LocaleUiText>
        ) : null}

        <View style={styles.periodRow} accessibilityLabel={t("billing.upgrade.selectPlan")}>
          {UPGRADE_PERIOD_ORDER.map((period) => {
            const selected = period === selectedPeriod;
            return (
              <Pressable
                key={period}
                onPress={() => onSelectPeriod(period)}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={upgradePeriodLabel(t, period)}
                style={({ pressed }) => [
                  styles.periodChip,
                  selected && styles.periodChipSelected,
                  pressed && styles.pressed,
                ]}
              >
                <LocaleUiText style={[styles.periodLabel, selected && styles.periodLabelSelected]}>
                  {upgradePeriodLabel(t, period)}
                </LocaleUiText>
              </Pressable>
            );
          })}
        </View>

        {catalogState === "loading" ? (
          <View style={styles.centerState} accessibilityLiveRegion="polite">
            <ActivityIndicator color={BRAND_GOLD} />
            <LocaleUiText style={styles.stateText}>{t("billing.upgrade.catalogLoading")}</LocaleUiText>
          </View>
        ) : null}

        {catalogState === "unavailable" ? (
          <View style={styles.centerState} accessibilityLiveRegion="polite">
            <LocaleUiText style={styles.stateText}>{t("billing.upgrade.catalogUnavailable")}</LocaleUiText>
          </View>
        ) : null}

        {catalogState === "ready"
          ? cards.map((card) => {
              const selected = card.sku === resolvedSku;
              return (
                <Pressable
                  key={card.sku}
                  onPress={() => onSelectSku(card.sku)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={`${card.name}. ${card.priceLabel ?? t("billing.upgrade.priceUnavailable")}`}
                  style={({ pressed }) => [
                    styles.planCard,
                    selected && styles.planCardSelected,
                    pressed && styles.pressed,
                  ]}
                >
                  <View style={styles.planHead}>
                    <LocaleUiText style={styles.planName}>{card.name}</LocaleUiText>
                    {card.priceState === "loading" ? (
                      <ActivityIndicator color={BRAND_GOLD} />
                    ) : (
                      <LocaleUiText style={styles.planPrice}>
                        {card.priceLabel ?? t("billing.upgrade.priceUnavailable")}
                      </LocaleUiText>
                    )}
                  </View>
                  {card.benefits.map((line) => (
                    <LocaleUiText key={line} style={styles.benefit}>
                      {line}
                    </LocaleUiText>
                  ))}
                </Pressable>
              );
            })
          : null}

        <LocaleUiText style={styles.storeNote}>{t("billing.upgrade.storePriceNote")}</LocaleUiText>
        <LocaleUiText style={styles.storeNote}>{t("billing.upgrade.letterheadIncluded")}</LocaleUiText>
        {trialEligible ? (
          <LocaleUiText style={styles.storeNote}>{t("billing.upgrade.trialNote")}</LocaleUiText>
        ) : null}

        {errorMessage ? (
          <View
            accessibilityLiveRegion="assertive"
            accessibilityRole="alert"
            style={styles.errorBox}
          >
            <LocaleUiText style={styles.errorText}>{errorMessage}</LocaleUiText>
          </View>
        ) : null}
      </ScrollView>
      <View style={styles.ctaDock}>
        <Pressable
          onPress={() => {
            const press = sheetDispatch.primaryPress;
            if (press.type === "purchase") {
              onPurchase(press.sku);
              return;
            }
            if (press.type === "trial") {
              onStartTrial();
            }
          }}
          disabled={!sheetDispatch.primaryEnabled}
          accessibilityRole="button"
          accessibilityState={{
            disabled: !sheetDispatch.primaryEnabled,
            busy: sheetDispatch.purchaseSpinner,
          }}
          accessibilityLabel={purchaseCtaLabel(t, cta.kind)}
          style={({ pressed }) => [
            styles.primaryCta,
            !sheetDispatch.primaryEnabled && styles.ctaDisabled,
            pressed && sheetDispatch.primaryEnabled && styles.pressed,
          ]}
        >
          {sheetDispatch.purchaseSpinner ? (
            <ActivityIndicator color={CURTAIN_TEXT} />
          ) : null}
          <LocaleUiText style={styles.primaryCtaLabel}>{purchaseCtaLabel(t, cta.kind)}</LocaleUiText>
        </Pressable>

        <Pressable
          onPress={() => {
            if (sheetDispatch.restoreEnabled) onRestore();
          }}
          disabled={!sheetDispatch.restoreEnabled}
          accessibilityRole="button"
          accessibilityState={{
            disabled: !sheetDispatch.restoreEnabled,
            busy: sheetDispatch.restoreSpinner,
          }}
          accessibilityLabel={restoreLabel}
          style={({ pressed }) => [
            styles.secondaryCta,
            !sheetDispatch.restoreEnabled && styles.ctaDisabled,
            pressed && sheetDispatch.restoreEnabled && styles.pressed,
          ]}
        >
          {sheetDispatch.restoreSpinner ? <ActivityIndicator color={CURTAIN_TEXT} /> : null}
          <LocaleUiText style={styles.secondaryCtaLabel}>{restoreLabel}</LocaleUiText>
        </Pressable>
      </View>
      </View>
    </CurtainSheet>
  );
}

const styles = StyleSheet.create({
  sheetHeader: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    alignSelf: "stretch",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: CURTAIN_DIVIDER,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
  },
  sheetTitle: {
    ...typography.titleMd,
    color: CURTAIN_TEXT,
    flex: 1,
    letterSpacing: -0.35,
  },
  sheetSubtitle: {
    ...typography.caption,
    color: CURTAIN_TEXT_MUTED,
    marginTop: spacing.sm,
  },
  closeHit: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  closeMark: {
    ...typography.titleLg,
    color: CURTAIN_TEXT,
    marginTop: -2,
  },
  scroll: { flex: 1, minHeight: 0 },
  sheetBody: {
    flex: 1,
    minHeight: 0,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    gap: spacing.md,
  },
  metaBlock: {
    gap: 4,
  },
  metaLabel: {
    ...typography.micro,
    color: CURTAIN_TEXT_SUBTLE,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  metaValue: {
    ...typography.bodyStrong,
    color: CURTAIN_TEXT,
    marginBottom: spacing.sm,
  },
  linkRow: {
    alignSelf: "flex-start",
    minHeight: 44,
    justifyContent: "center",
  },
  linkText: {
    ...typography.bodyStrong,
    color: BRAND_GOLD,
  },
  trustClaim: {
    ...typography.captionStrong,
    color: BRAND_GOLD,
    letterSpacing: 0.8,
  },
  periodRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  periodChip: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: CURTAIN_DIVIDER,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
  },
  periodChipSelected: {
    borderColor: BRAND_GOLD,
    backgroundColor: "rgba(201,168,76,0.12)",
  },
  periodLabel: {
    ...typography.captionStrong,
    color: CURTAIN_TEXT_MUTED,
  },
  periodLabelSelected: {
    color: BRAND_GOLD,
  },
  centerState: {
    minHeight: 88,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
  },
  stateText: {
    ...typography.caption,
    color: CURTAIN_TEXT_MUTED,
    textAlign: "center",
  },
  planCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: CURTAIN_DIVIDER,
    backgroundColor: CARD_FILL,
    padding: spacing.md,
    gap: 6,
  },
  planCardSelected: {
    borderColor: BRAND_GOLD,
  },
  planHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.md,
  },
  planName: {
    ...typography.titleSm,
    color: CURTAIN_TEXT,
    flex: 1,
  },
  planPrice: {
    ...typography.bodyStrong,
    color: BRAND_GOLD,
  },
  benefit: {
    ...typography.caption,
    color: CURTAIN_TEXT_MUTED,
  },
  storeNote: {
    ...typography.caption,
    color: CURTAIN_TEXT_SUBTLE,
  },
  errorBox: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(248,113,113,0.45)",
    backgroundColor: "rgba(248,113,113,0.12)",
    padding: spacing.md,
  },
  errorText: {
    ...typography.caption,
    color: "#FECACA",
  },
  ctaDock: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: CURTAIN_DIVIDER,
    backgroundColor: CURTAIN_SURFACE,
    gap: spacing.sm,
  },
  primaryCta: {
    minHeight: 52,
    borderRadius: 16,
    backgroundColor: BRAND_GOLD,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  primaryCtaLabel: {
    ...typography.bodyStrong,
    color: "#1E1B4B",
  },
  secondaryCta: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: spacing.sm,
  },
  secondaryCtaLabel: {
    ...typography.bodyStrong,
    color: CURTAIN_TEXT,
  },
  ctaDisabled: {
    opacity: 0.45,
  },
  pressed: {
    opacity: 0.8,
  },
});
