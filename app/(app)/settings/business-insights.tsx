import React from "react";
import { StyleSheet, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import type { ComponentProps } from "react";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";

import { FySelector } from "@/components/insights/FySelector";
import { insightCategoryHint, insightCategoryTitle } from "@/components/insights/insightCategoryCopy";
import { InsightsCategoryRow } from "@/components/insights/InsightsCategoryRow";
import { InsightsOverviewTiles } from "@/components/insights/InsightsOverviewTiles";
import { SettingsNavGroup } from "@/components/settings/SettingsNavCard";
import { Header, Loader, Screen, LocaleUiText, ErrorState } from "@/components/ui";
import { useBusinessInsightsDashboard } from "@/hooks/useBusinessInsightsDashboard";
import { useAuth } from "@/state/auth";
import { useT } from "@/i18n";
import {
  INSIGHT_CATEGORY_ORDER,
  INSIGHT_CATEGORY_SLUG,
  insightFyFromParam,
  insightScanLimitPhrases,
  type InsightCategoryId,
} from "@/services/insights/insightCategories";
import { translateInsightPhrases } from "@/services/insights/insightPhrases";
import { getCurrentFinancialYear } from "@/utils/financialYear";
import { spacing, typography, useThemedStyles } from "@/theme";
import { formatRecapTitle } from "@/services/insights/fyRecapService";

type IconName = ComponentProps<typeof MaterialCommunityIcons>["name"];

const CATEGORY_ICON: Record<InsightCategoryId, IconName> = {
  money_dues: "cash-multiple",
  goods_movement: "package-variant",
  customers_parties: "account-group-outline",
  work_records: "clipboard-text-outline",
};

export default function BusinessInsightsScreen() {
  const t = useT();
  const router = useRouter();
  const { user } = useAuth();
  const params = useLocalSearchParams<{ fy?: string | string[] }>();
  const [selectedFy, setSelectedFy] = React.useState(() =>
    insightFyFromParam(params.fy, getCurrentFinancialYear())
  );
  const { data, loading, error, reload } = useBusinessInsightsDashboard(user?.uid, user?.ueid, selectedFy);

  const styles = useThemedStyles((c) =>
    StyleSheet.create({
      intro: { ...typography.body, color: c.textMuted, marginBottom: spacing.sm },
      freshness: { ...typography.caption, color: c.textMuted, marginBottom: spacing.md },
      section: {
        ...typography.captionStrong,
        color: c.textMuted,
        textTransform: "uppercase",
        letterSpacing: 0.6,
        marginTop: spacing.lg,
        marginBottom: spacing.xs,
      },
      categories: { marginTop: spacing.lg },
      note: { ...typography.caption, color: c.textSubtle, marginTop: spacing.lg },
    })
  );

  const onSelectFy = (fy: number) => {
    setSelectedFy(fy);
    router.setParams({ fy: String(fy) });
  };

  const openCategory = (category: InsightCategoryId) => {
    router.push({
      pathname: "/(app)/settings/business-insights/category/[category]",
      params: { category: INSIGHT_CATEGORY_SLUG[category], fy: String(selectedFy) },
    });
  };

  const cash = data?.insights.find((insight) => insight.id === "cash_paid");
  const balance = data?.insights.find((insight) => insight.id === "shop_balance_open");
  const figure = (insight: typeof cash) =>
    insight ? translateInsightPhrases(insight.valuePhrases, t, " · ") || insight.valueLabel : "—";
  const freshness = data
    ? translateInsightPhrases(
        [...data.freshnessPhrases, ...insightScanLimitPhrases(data.insights)],
        t
      ) || data.freshnessSummary
    : "";

  return (
    <Screen scroll>
      <Header title={t("businessInsights.title")} showBack onBackPress={() => router.back()} />
      <LocaleUiText style={styles.intro}>{t("businessInsights.intro")}</LocaleUiText>
      <FySelector
        selectedFy={selectedFy}
        availableFys={data?.availableFys ?? [selectedFy]}
        onSelect={onSelectFy}
      />
      {loading ? (
        <Loader message={t("common.loading")} />
      ) : error ? (
        <ErrorState message={error} onRetry={() => void reload()} retryLabel={t("common.retry")} />
      ) : !data ? (
        <Loader message={t("common.loading")} />
      ) : (
        <>
          <LocaleUiText style={styles.freshness}>{freshness}</LocaleUiText>
          <LocaleUiText style={styles.section}>{t("businessInsights.sectionOverview")}</LocaleUiText>
          <InsightsOverviewTiles
            records={String(data.recordsCount)}
            pdfs={String(data.pdfsGeneratedCount)}
            cashPaid={figure(cash)}
            openBalance={figure(balance)}
          />

          <View style={styles.categories}>
            <SettingsNavGroup>
              {INSIGHT_CATEGORY_ORDER.map((category) => (
                <InsightsCategoryRow
                  key={category}
                  icon={CATEGORY_ICON[category]}
                  title={insightCategoryTitle(t, category)}
                  subtitle={insightCategoryHint(t, category)}
                  onPress={() => openCategory(category)}
                />
              ))}
            </SettingsNavGroup>
          </View>

          {data.archivedRecaps.length > 0 ? (
            <>
              <LocaleUiText style={styles.section}>{t("businessInsights.sectionArchives")}</LocaleUiText>
              <SettingsNavGroup>
                {data.archivedRecaps.map((recap) => (
                  <InsightsCategoryRow
                    key={recap.fyStartYear}
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
