import React, { useCallback, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useFocusEffect, useRouter } from "expo-router";
import type { ComponentProps } from "react";

import { Banner, LastRefreshedHint, Screen, SmartHeadline, LocaleUiText } from "@/components/ui";
import { GlobalSearchBar } from "@/components/search/GlobalSearchBar";
import { useAuth } from "@/state/auth";
import { useAppRefresh } from "@/hooks/useAppRefresh";
import { useT } from "@/i18n";
import { LuxuryPressable } from "@/components/ui/LuxuryPressable";
import {
  DASHBOARD_SECTION_GAP,
  executiveCardDepth,
  getCategoryAccent,
  spacing,
  typography,
  useTheme,
  useThemedStyles,
} from "@/theme";
import type { CategoryAccentKey } from "@/theme";
import type { BusinessEntryType } from "@/domain/businessEntry";
import {
  loadSavedRecordsData,
  type SavedRecordsData,
} from "@/services/savedRecords/savedRecordsService";

type MciName = ComponentProps<typeof MaterialCommunityIcons>["name"];

interface HubCategory {
  key: string;
  labelKey: string;
  icon: MciName;
  accentKey: CategoryAccentKey;
  count: number;
  preview: string | null;
  onPress: () => void;
}

export default function SavedRecordsTab() {
  const t = useT();
  const router = useRouter();
  const { user } = useAuth();
  const { resolvedMode } = useTheme();
  const userId = user?.uid ?? null;

  const [data, setData] = useState<SavedRecordsData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isDark = resolvedMode === "dark";

  const styles = useThemedStyles((c) =>
    StyleSheet.create({
      dashboard: { gap: DASHBOARD_SECTION_GAP },
      topCluster: { gap: spacing.md },
      searchWrap: { marginTop: spacing.sm },
      divider: {
        height: 1,
        backgroundColor: c.divider,
        opacity: 0.55,
        marginTop: spacing.md,
        marginBottom: spacing.xs,
      },
      grid: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: spacing.sm,
      },
      tile: {
        ...executiveCardDepth(isDark, c, 2),
        flexBasis: "48%",
        flexGrow: 1,
        padding: spacing.md + 2,
        gap: spacing.xs,
        minHeight: 108,
      },
      tileHeader: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
      },
      iconBubble: {
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: "center",
        justifyContent: "center",
      },
      countText: { ...typography.titleSm, color: c.text },
      tileLabel: { ...typography.captionStrong, color: c.text, marginTop: spacing.xs },
      tilePreview: { ...typography.micro, color: c.textMuted },
    })
  );

  const reload = useCallback(async () => {
    if (!userId) return;
    setError(null);
    try {
      const next = await loadSavedRecordsData(userId);
      setData(next);
    } catch {
      setError(t("savedRecords.loadError"));
    }
  }, [userId, t]);

  const { refreshing, refreshNote, onRefresh } = useAppRefresh({ onReload: reload });

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload])
  );

  const goType = useCallback(
    (type: BusinessEntryType) =>
      router.push({ pathname: "/(app)/diary", params: { type } }),
    [router]
  );

  const categories: HubCategory[] = useMemo(() => {
    const d = data;
    const b = (type: BusinessEntryType) => d?.byType[type];
    return [
      {
        key: "all",
        labelKey: "savedRecords.catAllRecords",
        icon: "folder-multiple-outline",
        accentKey: "work",
        count: d?.totalRecords ?? 0,
        preview: null,
        onPress: () => router.push("/(app)/diary"),
      },
      {
        key: "purchase_order",
        labelKey: "savedRecords.catPurchaseOrders",
        icon: "clipboard-text-outline",
        accentKey: "payment",
        count: d?.purchaseOrderCount ?? 0,
        preview: d?.purchaseOrderLatestTitle ?? null,
        onPress: () => router.push("/(app)/purchase-order"),
      },
      {
        key: "customer_credit",
        labelKey: "savedRecords.catCustomerCredit",
        icon: "account-cash-outline",
        accentKey: "cash",
        count: d?.customerCreditCount ?? 0,
        preview:
          (d?.customerCreditDueCount ?? 0) > 0
            ? t("savedRecords.creditDuePreview", { count: d?.customerCreditDueCount ?? 0 })
            : d?.customerCreditLatestTitle ?? null,
        onPress: () => router.push("/(app)/customer-credit"),
      },
      {
        key: "letterheads",
        labelKey: "savedRecords.catLetterheads",
        icon: "file-document-edit-outline",
        accentKey: "letterhead",
        count: d?.letterheadCount ?? 0,
        preview: d?.letterheadLatestTitle ?? null,
        onPress: () => router.push("/(app)/letterhead/history"),
      },
      {
        key: "pro_packs",
        labelKey: "savedRecords.catProPacks",
        icon: "briefcase-outline",
        accentKey: "proPack",
        count: d?.proPackCount ?? 0,
        preview: d?.proPackLatestTitle ?? null,
        onPress: () => router.push("/(app)/professional-pack/history"),
      },
      {
        key: "pdfs",
        labelKey: "savedRecords.catPdfs",
        icon: "file-pdf-box",
        accentKey: "letterhead",
        count: d?.pdfTotal ?? 0,
        preview: null,
        onPress: () => router.push("/(app)/diary"),
      },
      {
        key: "drafts",
        labelKey: "savedRecords.catDrafts",
        icon: "file-edit-outline",
        accentKey: "work",
        count: d?.draftCount ?? 0,
        preview: null,
        onPress: () => router.push("/(app)/drafts"),
      },
      {
        key: "payment_request",
        labelKey: "savedRecords.catPaymentRequests",
        icon: "cash-multiple",
        accentKey: "payment",
        count: b("payment_request")?.count ?? 0,
        preview: b("payment_request")?.latestTitle ?? null,
        onPress: () => goType("payment_request"),
      },
      {
        key: "business_cash_given",
        labelKey: "savedRecords.catCashPaid",
        icon: "cash-minus",
        accentKey: "cash",
        count: b("business_cash_given")?.count ?? 0,
        preview: b("business_cash_given")?.latestTitle ?? null,
        onPress: () => goType("business_cash_given"),
      },
      {
        key: "material_movement",
        labelKey: "savedRecords.catMaterialMovement",
        icon: "truck-delivery-outline",
        accentKey: "material",
        count:
          (b("material_dispatched")?.count ?? 0) +
          (b("material_received")?.count ?? 0) +
          (b("outward_freight_details")?.count ?? 0) +
          (b("material_return")?.count ?? 0),
        preview:
          [
            b("material_dispatched"),
            b("material_received"),
            b("outward_freight_details"),
            b("material_return"),
          ]
            .filter((x) => x?.latestAt != null)
            .sort((a, c) => (c?.latestAt ?? 0) - (a?.latestAt ?? 0))[0]?.latestTitle ?? null,
        onPress: () => router.push("/(app)/diary/material-movement"),
      },
      {
        key: "work_team",
        labelKey: "savedRecords.catWorkTeam",
        icon: "hammer-wrench",
        accentKey: "work",
        count: (b("work_update_issue")?.count ?? 0) + (b("staff_matter")?.count ?? 0),
        preview:
          [b("work_update_issue"), b("staff_matter")]
            .filter((x) => x?.latestAt != null)
            .sort((a, c) => (c?.latestAt ?? 0) - (a?.latestAt ?? 0))[0]?.latestTitle ?? null,
        onPress: () => router.push("/(app)/diary/work-team"),
      },
      {
        key: "reminders",
        labelKey: "savedRecords.catReminders",
        icon: "bell-outline",
        accentKey: "reminder",
        count: d?.upcomingCount ?? 0,
        preview: null,
        onPress: () =>
          router.push({ pathname: "/(app)/diary", params: { filter: "upcoming" } }),
      },
    ];
  }, [data, router, goType, t]);

  return (
    <Screen scroll padded tabBarInset refreshing={refreshing} onRefresh={onRefresh}>
      <View style={styles.dashboard}>
        <View style={styles.topCluster}>
          <SmartHeadline
            title={t("savedRecords.title")}
            subtitle={t("savedRecords.subtitle")}
            density="dashboard"
            iconName="archive-outline"
            accentKey="work"
          />
          <View style={styles.searchWrap}>
            <GlobalSearchBar />
          </View>
          {error ? <Banner tone="danger" message={error} /> : null}
          <View style={styles.divider} />
          <LastRefreshedHint message={refreshNote} />
        </View>

        <View style={styles.grid}>
          {categories.map((cat) => {
            const accent = getCategoryAccent(cat.accentKey, resolvedMode);
            return (
              <LuxuryPressable
                key={cat.key}
                style={styles.tile}
                onPress={cat.onPress}
                accessibilityRole="button"
                accessibilityLabel={t(cat.labelKey)}
              >
                <View style={styles.tileHeader}>
                  <View style={[styles.iconBubble, { backgroundColor: accent.soft }]}>
                    <MaterialCommunityIcons name={cat.icon} size={20} color={accent.main} />
                  </View>
                  <Text style={[styles.countText, { color: accent.main }]}>{cat.count}</Text>
                </View>
                <LocaleUiText style={styles.tileLabel} numberOfLines={1}>
                  {t(cat.labelKey)}
                </LocaleUiText>
                {cat.preview ? (
                  <Text style={styles.tilePreview} numberOfLines={1}>
                    {cat.preview}
                  </Text>
                ) : (
                  <LocaleUiText style={styles.tilePreview} numberOfLines={1}>
                    {t("savedRecords.tapToView")}
                  </LocaleUiText>
                )}
              </LuxuryPressable>
            );
          })}
        </View>
      </View>
    </Screen>
  );
}
