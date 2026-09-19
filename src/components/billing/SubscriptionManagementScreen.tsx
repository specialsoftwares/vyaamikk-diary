/**
 * Production subscription management. Presentation-only for entitlements:
 * status comes from SubscriptionProvider; purchases/restore from IapProvider.
 * Reads/saves publish only for the originating UID+generation.
 */

import React, { useEffect, useMemo, useState } from "react";
import { AppState, Linking, Platform, StyleSheet, View } from "react-native";

import { useIap } from "@/billing/iap";
import { saveBillingDetailsClient } from "@/billing/iap/billingDetailsClient";
import { storeSubscriptionsManageUrl } from "@/billing/iap/playSubscriptionsUrl";
import { isSubscriptionPurchaseEntryEnabled } from "@/billing/iap/purchaseEntryGate";
import { notifyManualUpgrade } from "@/billing/quotaUpsell";
import {
  Card,
  Header,
  LocaleUiText,
  PremiumActionButton,
  Screen,
} from "@/components/ui";
import { useT } from "@/i18n";
import { useAuth } from "@/state/auth";
import { useSubscription } from "@/subscription";
import { BillingDetailsForm } from "@/components/billing/BillingDetailsForm";
import {
  billingHistoryTypeCopyKey,
  formatHistoryAmountInr,
  type SanitizedBillingHistoryRow,
} from "@/subscription/billingHistoryPresentation";
import { readOwnerBillingDetails } from "@/subscription/billingDetailsReader";
import { readOwnerBillingHistory } from "@/subscription/billingHistoryReader";
import { readOwnerQuotaUsage } from "@/subscription/quotaUsageReader";
import {
  managementPendingCopyKey,
  managementPendingKind,
  managementPeriodEndMs,
  managementPlanNameKey,
  managementQuotaView,
} from "@/subscription/subscriptionManagementPresentation";
import { createSubscriptionManagementRuntime, maskManagementSnapshot } from "@/subscription/subscriptionManagementRuntime";
import { syncSessionOwnership } from "@/sync/syncSessionOwnership";
import { spacing, typography, useThemedStyles } from "@/theme";

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function SubscriptionManagementScreen() {
  const t = useT();
  const { user } = useAuth();
  const subscription = useSubscription();
  const iap = useIap();
  const uid = user?.uid ?? null;
  const session = syncSessionOwnership.capture();
  const liveSession =
    uid && session && uid === session.uid
      ? { uid: session.uid, generation: session.generation }
      : null;
  const live = { authUid: uid, session: liveSession };

  const iapRef = React.useRef(iap);
  iapRef.current = iap;
  const liveRef = React.useRef(live);
  liveRef.current = live;

  const [runtime] = useState(() =>
    createSubscriptionManagementRuntime({
      readUsage: readOwnerQuotaUsage,
      readHistory: readOwnerBillingHistory,
      readDetails: readOwnerBillingDetails,
      saveDetails: saveBillingDetailsClient,
      restore: () => iapRef.current.restorePurchases(),
      openUrl: (url) => Linking.openURL(url),
      presentUpgrade: notifyManualUpgrade,
      liveSession: () => liveRef.current,
    })
  );
  const [, setTick] = useState(0);
  const published = maskManagementSnapshot(runtime.snapshot(), live);

  useEffect(() => {
    return runtime.subscribe(() => setTick((n) => n + 1));
  }, [runtime]);

  useEffect(() => {
    runtime.setOwner(liveSession);
    // Ownership is UID + generation, not the capture() object identity.
  }, [runtime, liveSession?.uid, liveSession?.generation]); // eslint-disable-line react-hooks/exhaustive-deps -- session object identity is not the key

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") runtime.reload();
    });
    return () => sub.remove();
  }, [runtime]);

  useEffect(() => () => runtime.dispose(), [runtime]);

  const styles = useThemedStyles((colors) =>
    StyleSheet.create({
      sectionTitle: {
        ...typography.captionStrong,
        color: colors.textMuted,
        textTransform: "uppercase",
        letterSpacing: 0.6,
        marginBottom: spacing.sm,
      },
      card: { marginBottom: spacing.md, gap: spacing.sm },
      body: { ...typography.body, color: colors.text, lineHeight: 22 },
      muted: { ...typography.caption, color: colors.textMuted, lineHeight: 18 },
      error: { ...typography.caption, color: colors.danger, lineHeight: 18 },
      barTrack: {
        height: 6,
        borderRadius: 3,
        backgroundColor: colors.divider,
        overflow: "hidden",
      },
      barFill: { height: 6, backgroundColor: colors.primary },
      historyRow: { gap: 2, paddingVertical: spacing.sm },
      divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.divider },
    })
  );

  const pendingKey = managementPendingCopyKey(managementPendingKind(subscription.status));
  const periodEnd = managementPeriodEndMs(subscription.status);
  const quota = managementQuotaView({
    features: subscription.features,
    usage: published.usage,
    nowMs: Date.now(),
  });

  const quotaCopy = useMemo(() => {
    if (quota.kind === "unlimited") return t("billing.management.quotaUnlimited");
    if (quota.kind === "unavailable") {
      if (quota.currency.kind === "malformed") return t("billing.management.quotaMalformed");
      return t("billing.management.quotaUnavailable");
    }
    if (quota.currency.kind === "prior_month") {
      return t("billing.management.quotaPriorMonth", { month: quota.currency.storedMonthKey, limit: quota.limit });
    }
    if (quota.currency.kind === "future_month") {
      return t("billing.management.quotaFutureMonth", { month: quota.currency.storedMonthKey });
    }
    if (quota.used == null) return t("billing.management.quotaUnknown", { limit: quota.limit });
    return t("billing.management.quotaUsed", { used: quota.used, limit: quota.limit });
  }, [quota, t]);

  const storeBusy = iap.purchaseInFlight || iap.pending != null || published.restoring;
  const platform = subscription.status.platform ?? (Platform.OS === "ios" ? "ios" : "android");
  const purchaseEntryOn = isSubscriptionPurchaseEntryEnabled();
  const barRatio =
    quota.kind === "capped" && quota.used != null && quota.limit > 0
      ? Math.min(1, quota.used / quota.limit)
      : 0;

  const historyRows: SanitizedBillingHistoryRow[] =
    published.history?.kind === "ok" ? published.history.rows : [];

  const upgradeErrorCopy =
    published.upgradeError === "purchase_entry_closed"
      ? t("billing.management.purchaseEntryClosed")
      : published.upgradeError
        ? t("billing.management.upgradeUnavailable")
        : null;
  const restoreErrorCopy =
    published.restoreError === "unavailable"
      ? t("billing.upgrade.restoreUnavailable")
      : published.restoreError === "failed"
        ? t("billing.management.restoreBusy")
        : published.restoreError;
  const saveErrorCopy =
    published.saveError === "save_failed"
      ? t("billing.management.saveFailed")
      : published.saveError
        ? t("billing.management.saveFailed")
        : null;

  return (
    <Screen scroll>
      <Header
        variant="executive"
        title={t("billing.management.title")}
        subtitle={t("billing.management.subtitle")}
        showBack
        backFrom="settings"
      />

      <LocaleUiText style={styles.sectionTitle}>{t("billing.management.planSection")}</LocaleUiText>
      <Card style={styles.card}>
        {subscription.isLoading ? (
          <LocaleUiText style={styles.muted}>{t("billing.management.loading")}</LocaleUiText>
        ) : (
          <>
            <LocaleUiText style={styles.body}>
              {t("billing.management.currentPlan")}: {t(managementPlanNameKey(subscription.plan))}
            </LocaleUiText>
            <LocaleUiText style={styles.muted}>{t(pendingKey)}</LocaleUiText>
            <LocaleUiText style={styles.muted}>
              {periodEnd
                ? t("billing.management.periodEnds", { date: formatDate(periodEnd) })
                : t("billing.management.periodUnknown")}
            </LocaleUiText>
            <LocaleUiText style={styles.muted}>{quotaCopy}</LocaleUiText>
            {quota.kind === "capped" && quota.used != null ? (
              <View style={styles.barTrack} accessibilityRole="progressbar">
                <View style={[styles.barFill, { width: `${Math.round(barRatio * 100)}%` }]} />
              </View>
            ) : null}
            {quota.kind === "capped" && quota.warnAt80 ? (
              <LocaleUiText style={styles.muted}>{t("billing.management.quotaWarn80")}</LocaleUiText>
            ) : null}
            <LocaleUiText style={styles.muted}>{t("billing.upgrade.letterheadIncluded")}</LocaleUiText>
          </>
        )}
        {subscription.error ? <LocaleUiText style={styles.error}>{subscription.error}</LocaleUiText> : null}
        <PremiumActionButton
          label={t("billing.management.upgradeCta")}
          onPress={() => {
            const result = runtime.presentUpgrade(syncSessionOwnership.capture());
            if (!result.ok && result.reason !== "purchase_entry_closed") {
              /* runtime already recorded upgradeError */
            }
          }}
          disabled={storeBusy || !purchaseEntryOn}
          accessibilityLabel={t("billing.management.upgradeCta")}
        />
        {upgradeErrorCopy ? <LocaleUiText style={styles.error}>{upgradeErrorCopy}</LocaleUiText> : null}
        {!purchaseEntryOn ? (
          <LocaleUiText style={styles.muted}>{t("billing.management.purchaseEntryClosed")}</LocaleUiText>
        ) : null}
        <PremiumActionButton
          variant="secondary"
          label={t("billing.upgrade.ctaRestore")}
          onPress={() => {
            void runtime.restore();
          }}
          loading={storeBusy}
          disabled={!iap.available || storeBusy}
          accessibilityLabel={t("billing.upgrade.ctaRestore")}
        />
        <LocaleUiText style={styles.muted}>{t("billing.management.restoreNotCancel")}</LocaleUiText>
        {restoreErrorCopy ? <LocaleUiText style={styles.error}>{restoreErrorCopy}</LocaleUiText> : null}
        <PremiumActionButton
          variant="ghost"
          label={t("billing.management.managePlay")}
          onPress={() => {
            void runtime.manage(storeSubscriptionsManageUrl({ platform, plan: subscription.plan }));
          }}
          accessibilityLabel={t("billing.management.managePlay")}
        />
        <LocaleUiText style={styles.muted}>{t("billing.management.managePlayHint")}</LocaleUiText>
        {published.manageError ? (
          <LocaleUiText style={styles.error}>{t("billing.management.manageUnavailable")}</LocaleUiText>
        ) : null}
      </Card>

      <LocaleUiText style={styles.sectionTitle}>{t("billing.management.historyTitle")}</LocaleUiText>
      <Card style={styles.card}>
        {published.history == null ? (
          <LocaleUiText style={styles.muted}>{t("billing.management.loading")}</LocaleUiText>
        ) : published.history.kind === "unavailable" ? (
          <LocaleUiText style={styles.muted}>{t("billing.management.historyUnavailable")}</LocaleUiText>
        ) : historyRows.length === 0 ? (
          <LocaleUiText style={styles.muted}>{t("billing.management.historyEmpty")}</LocaleUiText>
        ) : (
          historyRows.map((row, index) => (
            <View key={row.id}>
              {index > 0 ? <View style={styles.divider} /> : null}
              <View style={styles.historyRow}>
                <LocaleUiText style={styles.body}>{t(billingHistoryTypeCopyKey(row.type))}</LocaleUiText>
                <LocaleUiText style={styles.muted}>{formatDate(row.occurredAt)}</LocaleUiText>
                {formatHistoryAmountInr(row.amountInPaise) ? (
                  <LocaleUiText style={styles.muted}>{formatHistoryAmountInr(row.amountInPaise)}</LocaleUiText>
                ) : null}
                {row.taxDocumentNumber ? (
                  <LocaleUiText style={styles.muted}>{row.taxDocumentNumber}</LocaleUiText>
                ) : null}
              </View>
            </View>
          ))
        )}
      </Card>

      <LocaleUiText style={styles.sectionTitle}>{t("billing.management.detailsTitle")}</LocaleUiText>
      <Card style={styles.card}>
        {published.detailsKind === "loading" ? (
          <LocaleUiText style={styles.muted}>{t("billing.management.loading")}</LocaleUiText>
        ) : published.detailsKind === "unavailable" ? (
          <LocaleUiText style={styles.muted}>{t("billing.management.detailsUnavailable")}</LocaleUiText>
        ) : (
          <>
            <LocaleUiText style={styles.muted}>
              {published.invoiceReady
                ? t("billing.management.invoiceReadyHint")
                : t("billing.management.invoiceIncompleteHint")}
            </LocaleUiText>
            <BillingDetailsForm
              t={t}
              draft={published.draft}
              onChange={(draft) => runtime.setDraft(draft)}
              gstinError={
                published.gstinError ? t("billing.management.gstInvalid") : null
              }
              saveError={saveErrorCopy}
              saving={published.saving}
              saveDisabled={!uid}
              onSave={() => {
                void runtime.saveDetails();
              }}
            />
          </>
        )}
      </Card>
    </Screen>
  );
}
