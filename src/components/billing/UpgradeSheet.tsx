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
  type CurtainSheetHandle,
} from "@/components/ui/CurtainSheet";
import { BRAND_GOLD } from "@/config/brandMotion";
import { useT } from "@/i18n";
import { spacing, typography } from "@/theme";

import {
  buildUpgradePlanCards,
  canDispatchPurchase,
  canDispatchRestore,
  defaultSelectedSku,
  resolveUpgradeCta,
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
  const cta = resolveUpgradeCta({
    trialEligible,
    purchaseAvailable,
    purchaseState,
    catalogState,
  });
  const resolvedSku = defaultSelectedSku(cards, selectedSku);
  const offerReady = selectedOfferIsReady(offers, resolvedSku);
  const purchaseEnabled = canDispatchPurchase({
    ctaEnabled: cta.enabled,
    selectedSku: resolvedSku,
    selectedOfferReady: offerReady,
  });
  const restoreEnabled = canDispatchRestore({ restoreAvailable, restoreState });
  const busy =
    purchaseState === "loading" ||
    purchaseState === "pending" ||
    restoreState === "loading" ||
    restoreState === "pending";

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

        <Pressable
          onPress={() => {
            if (resolvedSku && purchaseEnabled) onPurchase(resolvedSku);
          }}
          disabled={!purchaseEnabled || busy}
          accessibilityRole="button"
          accessibilityState={{ disabled: !purchaseEnabled || busy, busy }}
          accessibilityLabel={purchaseCtaLabel(t, cta.kind)}
          style={({ pressed }) => [
            styles.primaryCta,
            (!purchaseEnabled || busy) && styles.ctaDisabled,
            pressed && purchaseEnabled && !busy && styles.pressed,
          ]}
        >
          {busy && (purchaseState === "loading" || purchaseState === "pending") ? (
            <ActivityIndicator color={CURTAIN_TEXT} />
          ) : null}
          <LocaleUiText style={styles.primaryCtaLabel}>{purchaseCtaLabel(t, cta.kind)}</LocaleUiText>
        </Pressable>

        <Pressable
          onPress={() => {
            if (restoreEnabled) onRestore();
          }}
          disabled={!restoreEnabled || busy}
          accessibilityRole="button"
          accessibilityState={{ disabled: !restoreEnabled || busy, busy }}
          accessibilityLabel={
            restoreEnabled ? t("billing.upgrade.ctaRestore") : t("billing.upgrade.restoreUnavailable")
          }
          style={({ pressed }) => [
            styles.secondaryCta,
            (!restoreEnabled || busy) && styles.ctaDisabled,
            pressed && restoreEnabled && !busy && styles.pressed,
          ]}
        >
          <LocaleUiText style={styles.secondaryCtaLabel}>
            {restoreEnabled ? t("billing.upgrade.ctaRestore") : t("billing.upgrade.restoreUnavailable")}
          </LocaleUiText>
        </Pressable>
      </ScrollView>
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
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
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
