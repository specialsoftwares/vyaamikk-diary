import React, { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { FySelector } from "@/components/insights/FySelector";
import { InsightsCategoryRow } from "@/components/insights/InsightsCategoryRow";
import { InsightsOverviewTiles } from "@/components/insights/InsightsOverviewTiles";
import { SettingsNavGroup } from "@/components/settings/SettingsNavCard";
import { Header, Loader, Screen, LocaleUiText, ErrorState } from "@/components/ui";
import { useBusinessInsightsDashboard } from "@/hooks/useBusinessInsightsDashboard";
import { useAuth } from "@/state/auth";
import { useT } from "@/i18n";
import { getCurrentFinancialYear } from "@/utils/financialYear";
import { formatAmount } from "@/utils/formatters/formatAmount";
import { spacing, typography, useThemedStyles } from "@/theme";
import { formatRecapTitle } from "@/services/insights/fyRecapService";

function fmtMoney(v: number) {
  return formatAmount(v, { maximumFractionDigits: 0 });
}

export default function BusinessInsightsScreen() {
  const t = useT();
  const router = useRouter();
  const { user } = useAuth();
  const [selectedFy, setSelectedFy] = useState(getCurrentFinancialYear());
  const { data, loading, error, reload } = useBusinessInsightsDashboard(user?.uid, user?.ueid, selectedFy);

  const styles = useThemedStyles((c) =>
    StyleSheet.create({
      intro: { ...typography.body, color: c.textMuted, marginBottom: spacing.sm },
      section: {
        ...typography.captionStrong,
        color: c.textMuted,
        textTransform: "uppercase",
        letterSpacing: 0.6,
        marginTop: spacing.lg,
        marginBottom: spacing.xs,
      },
      note: { ...typography.caption, color: c.textSubtle, marginTop: spacing.lg, lineHeight: 18 },
      divider: { height: StyleSheet.hairlineWidth, backgroundColor: c.divider, marginLeft: 56 },
    })
  );

  const nav = (path: string) =>
    router.push({
      pathname: path as never,
      params: { fy: String(selectedFy) },
    });

  const cashLabel = useMemo(
    () => (data ? fmtMoney(data.cashPaid.fyTotal) : "—"),
    [data]
  );

  return (
    <Screen scroll>
      <Header title={t("businessInsights.title")} showBack onBackPress={() => router.back()} />
      <LocaleUiText style={styles.intro}>{t("businessInsights.intro")}</LocaleUiText>
      <FySelector
        selectedFy={selectedFy}
        availableFys={data?.availableFys ?? [selectedFy]}
        onSelect={setSelectedFy}
      />
      {loading ? (
        <Loader message={t("common.loading")} />
      ) : error ? (
        <ErrorState message={error} onRetry={() => void reload()} retryLabel={t("common.retry")} />
      ) : !data ? (
        <Loader message={t("common.loading")} />
      ) : (
        <>
          <LocaleUiText style={styles.section}>{t("businessInsights.sectionOverview")}</LocaleUiText>
          <InsightsOverviewTiles
            records={String(data.recordsCount)}
            pdfs={String(data.pdfsGeneratedCount)}
            cashPaid={cashLabel}
            distanceFy={
              data.distance.fyKm > 0
                ? t("businessInsights.routeKm", { km: data.distance.fyKm })
                : "0 km"
            }
          />

          <LocaleUiText style={styles.section}>{t("businessInsights.sectionPeople")}</LocaleUiText>
          <SettingsNavGroup>
            <InsightsCategoryRow
              icon="account-group-outline"
              title={t("businessInsights.partiesTitle")}
              subtitle={t("businessInsights.partiesSubtitle")}
              value={String(data.parties.length)}
              onPress={() => nav("/(app)/settings/business-insights/parties")}
            />
            <View style={styles.divider} />
            <InsightsCategoryRow
              icon="storefront-outline"
              title={t("businessInsights.customersTitle")}
              subtitle={t("businessInsights.customersSubtitle")}
              value={String(data.customers.length)}
              onPress={() => nav("/(app)/settings/business-insights/customers")}
            />
          </SettingsNavGroup>

          <LocaleUiText style={styles.section}>{t("businessInsights.sectionPlaces")}</LocaleUiText>
          <SettingsNavGroup>
            <InsightsCategoryRow
              icon="map-marker-outline"
              title={t("businessInsights.pinsTitle")}
              subtitle={t("businessInsights.pinsSubtitle")}
              value={String(data.pins.length)}
              onPress={() => nav("/(app)/settings/business-insights/pins")}
            />
            <View style={styles.divider} />
            <InsightsCategoryRow
              icon="truck-outline"
              title={t("businessInsights.movementTitle")}
              subtitle={t("businessInsights.movementSubtitle")}
              value={t("businessInsights.routeKm", { km: data.distance.fyKm })}
              onPress={() => nav("/(app)/settings/business-insights/movement")}
            />
          </SettingsNavGroup>

          <LocaleUiText style={styles.section}>{t("businessInsights.sectionMoney")}</LocaleUiText>
          <SettingsNavGroup>
            <InsightsCategoryRow
              icon="cash-multiple"
              title={t("businessInsights.cashPaidTitle")}
              subtitle={t("businessInsights.cashPaidSubtitle")}
              value={cashLabel}
              onPress={() => nav("/(app)/settings/business-insights/cash-paid")}
            />
            <View style={styles.divider} />
            <InsightsCategoryRow
              icon="credit-card-outline"
              title={t("businessInsights.shopCreditTitle")}
              subtitle={t("businessInsights.shopCreditSubtitle", {
                active: data.creditActiveCount,
                closed: data.creditClosedCount,
              })}
              value={fmtMoney(data.creditPendingBalance)}
              onPress={() => nav("/(app)/settings/business-insights/customers")}
            />
          </SettingsNavGroup>

          {data.archivedRecaps.length > 0 ? (
            <>
              <LocaleUiText style={styles.section}>{t("businessInsights.sectionArchives")}</LocaleUiText>
              <SettingsNavGroup>
                {data.archivedRecaps.map((recap, idx) => (
                  <React.Fragment key={recap.fyStartYear}>
                    {idx > 0 ? <View style={styles.divider} /> : null}
                    <InsightsCategoryRow
                      icon="file-chart-outline"
                      title={t("businessInsights.recapTitle", {
                        fy: formatRecapTitle(recap.fyStartYear),
                      })}
                      subtitle={
                        recap.status === "preparing"
                          ? t("businessInsights.recapPreparing")
                          : t("businessInsights.recapReady")
                      }
                      onPress={() =>
                        router.push({
                          pathname: "/(app)/settings/business-insights/recap/[fy]",
                          params: { fy: String(recap.fyStartYear) },
                        })
                      }
                    />
                  </React.Fragment>
                ))}
              </SettingsNavGroup>
            </>
          ) : null}

          <LocaleUiText style={styles.note}>{t("businessInsights.privacyNote")}</LocaleUiText>
        </>
      )}
    </Screen>
  );
}
