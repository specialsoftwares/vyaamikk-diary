/**
 * Production subscription management. Presentation-only for entitlements:
 * status comes from SubscriptionProvider; purchases/restore from IapProvider.
 * No second native purchase controller. No client entitlement writes.
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Linking, Platform, StyleSheet, View } from "react-native";

import { useIap } from "@/billing/iap";
import { saveBillingDetailsClient } from "@/billing/iap/billingDetailsClient";
import { storeSubscriptionsManageUrl } from "@/billing/iap/playSubscriptionsUrl";
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
import {
  draftFromDetails,
  payloadFromDraft,
  BillingDetailsForm,
  type BillingDetailsDraft,
} from "@/components/billing/BillingDetailsForm";
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

  const [usage, setUsage] = useState<Awaited<ReturnType<typeof readOwnerQuotaUsage>> | null>(null);
  const [history, setHistory] = useState<
    Awaited<ReturnType<typeof readOwnerBillingHistory>> | null
  >(null);
  const [detailsKind, setDetailsKind] = useState<"loading" | "ready" | "unavailable">("loading");
  const [draft, setDraft] = useState<BillingDetailsDraft>(draftFromDetails(null));
  const [gstinError, setGstinError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [manageError, setManageError] = useState<string | null>(null);
  const [upgradeError, setUpgradeError] = useState<string | null>(null);

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
      historyRow: { gap: 2, paddingVertical: spacing.sm },
      divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.divider },
    })
  );

  const reload = useCallback(async () => {
    if (!uid) {
      setUsage({ kind: "unavailable", code: "signed_out" });
      setHistory({ kind: "unavailable", code: "signed_out" });
      setDetailsKind("unavailable");
      return;
    }
    const [usageRead, historyRead, detailsRead] = await Promise.all([
      readOwnerQuotaUsage(uid),
      readOwnerBillingHistory(uid),
      readOwnerBillingDetails(uid),
    ]);
    setUsage(usageRead);
    setHistory(historyRead);
    if (detailsRead.kind === "ok") {
      setDraft(draftFromDetails(detailsRead.details));
      setDetailsKind("ready");
    } else if (detailsRead.kind === "missing") {
      setDraft(draftFromDetails(null));
      setDetailsKind("ready");
    } else {
      setDetailsKind("unavailable");
    }
  }, [uid]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const pendingKey = managementPendingCopyKey(managementPendingKind(subscription.status));
  const periodEnd = managementPeriodEndMs(subscription.status);
  const quota = managementQuotaView({
    features: subscription.features,
    recordsThisMonth: usage?.kind === "ok" ? usage.recordsThisMonth : null,
    usageReadable: usage?.kind === "ok" || usage?.kind === "missing",
  });

  const quotaCopy = useMemo(() => {
    if (quota.kind === "unlimited") return t("billing.management.quotaUnlimited");
    if (quota.kind === "unavailable") return t("billing.management.quotaUnavailable");
    if (quota.used == null) return t("billing.management.quotaUnknown", { limit: quota.limit });
    return t("billing.management.quotaUsed", { used: quota.used, limit: quota.limit });
  }, [quota, t]);

  const storeBusy = iap.purchaseInFlight || iap.pending != null;
  const platform = subscription.status.platform ?? (Platform.OS === "ios" ? "ios" : "android");

  const onUpgrade = () => {
    setUpgradeError(null);
    const result = notifyManualUpgrade(syncSessionOwnership.capture());
    if (!result.ok) {
      setUpgradeError(t("billing.management.upgradeUnavailable"));
    }
  };

  const onRestore = async () => {
    setRestoreError(null);
    if (storeBusy) {
      setRestoreError(t("billing.management.restoreBusy"));
      return;
    }
    const result = await iap.restorePurchases();
    if (result.kind === "failed") {
      setRestoreError(result.message);
    } else if (result.kind === "unavailable") {
      setRestoreError(t("billing.upgrade.restoreUnavailable"));
    }
  };

  const onManage = async () => {
    setManageError(null);
    const url = storeSubscriptionsManageUrl({ platform, plan: subscription.plan });
    try {
      const opened = await Linking.openURL(url);
      if (opened === false) {
        setManageError(t("billing.management.manageUnavailable"));
      }
    } catch {
      setManageError(t("billing.management.manageUnavailable"));
    }
  };

  const onSaveDetails = async () => {
    setGstinError(null);
    setSaveError(null);
    setSaving(true);
    try {
      const result = await saveBillingDetailsClient(payloadFromDraft(draft));
      if (result.kind === "saved") {
        await reload();
        return;
      }
      if (result.kind === "gstin_format_invalid") {
        setGstinError(t("billing.management.gstInvalid"));
        return;
      }
      setSaveError(result.message);
    } catch {
      setSaveError(t("billing.management.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  const historyRows: SanitizedBillingHistoryRow[] =
    history?.kind === "ok" ? history.rows : [];

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
            <LocaleUiText style={styles.muted}>{t("billing.upgrade.letterheadIncluded")}</LocaleUiText>
          </>
        )}
        {subscription.error ? <LocaleUiText style={styles.error}>{subscription.error}</LocaleUiText> : null}
        <PremiumActionButton
          label={t("billing.management.upgradeCta")}
          onPress={onUpgrade}
          disabled={storeBusy}
          accessibilityLabel={t("billing.management.upgradeCta")}
        />
        {upgradeError ? <LocaleUiText style={styles.error}>{upgradeError}</LocaleUiText> : null}
        <PremiumActionButton
          variant="secondary"
          label={t("billing.upgrade.ctaRestore")}
          onPress={() => {
            void onRestore();
          }}
          loading={storeBusy}
          disabled={!iap.available || storeBusy}
          accessibilityLabel={t("billing.upgrade.ctaRestore")}
        />
        <LocaleUiText style={styles.muted}>{t("billing.management.restoreNotCancel")}</LocaleUiText>
        {restoreError ? <LocaleUiText style={styles.error}>{restoreError}</LocaleUiText> : null}
        <PremiumActionButton
          variant="ghost"
          label={t("billing.management.managePlay")}
          onPress={() => {
            void onManage();
          }}
          accessibilityLabel={t("billing.management.managePlay")}
        />
        <LocaleUiText style={styles.muted}>{t("billing.management.managePlayHint")}</LocaleUiText>
        {manageError ? <LocaleUiText style={styles.error}>{manageError}</LocaleUiText> : null}
      </Card>

      <LocaleUiText style={styles.sectionTitle}>{t("billing.management.historyTitle")}</LocaleUiText>
      <Card style={styles.card}>
        {history == null ? (
          <LocaleUiText style={styles.muted}>{t("billing.management.loading")}</LocaleUiText>
        ) : history.kind === "unavailable" ? (
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
        {detailsKind === "loading" ? (
          <LocaleUiText style={styles.muted}>{t("billing.management.loading")}</LocaleUiText>
        ) : detailsKind === "unavailable" ? (
          <LocaleUiText style={styles.muted}>{t("billing.management.detailsUnavailable")}</LocaleUiText>
        ) : (
          <BillingDetailsForm
            t={t}
            draft={draft}
            onChange={setDraft}
            gstinError={gstinError}
            saveError={saveError}
            saving={saving}
            saveDisabled={!uid}
            onSave={() => {
              void onSaveDetails();
            }}
          />
        )}
      </Card>
    </Screen>
  );
}
