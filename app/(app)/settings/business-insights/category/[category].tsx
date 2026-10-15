import React from "react";
import { StyleSheet, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { ExplainableInsightList } from "@/components/insights/ExplainableInsightList";
import {
  insightCategoryHint,
  insightCategoryTitle,
  insightCategoryUnknown,
} from "@/components/insights/insightCategoryCopy";
import { InsightsCategoryRow } from "@/components/insights/InsightsCategoryRow";
import { SettingsNavGroup } from "@/components/settings/SettingsNavCard";
import { ErrorState, Header, Loader, LocaleUiText, Screen } from "@/components/ui";
import { useBusinessInsightsDashboard } from "@/hooks/useBusinessInsightsDashboard";
import { useT } from "@/i18n";
import {
  filterInsightsByCategory,
  insightCategoryFromParam,
  insightFyFromParam,
} from "@/services/insights/insightCategories";
import { translateInsightPhrases } from "@/services/insights/insightPhrases";
import { useAuth } from "@/state/auth";
import { spacing, typography, useThemedStyles } from "@/theme";
import { formatFinancialYearLabel, getCurrentFinancialYear } from "@/utils/financialYear";

export default function BusinessInsightsCategoryScreen() {
  const t = useT();
  const router = useRouter();
  const { user } = useAuth();
  const params = useLocalSearchParams<{ category?: string | string[]; fy?: string | string[] }>();
  const category = insightCategoryFromParam(params.category);
  const selectedFy = insightFyFromParam(params.fy, getCurrentFinancialYear());
  const { data, loading, error, reload } = useBusinessInsightsDashboard(user?.uid, user?.ueid, selectedFy);

  const styles = useThemedStyles((c) =>
    StyleSheet.create({
      intro: { ...typography.body, color: c.textMuted, marginBottom: spacing.sm },
      freshness: { ...typography.caption, color: c.textMuted, marginBottom: spacing.md },
      follow: { marginTop: spacing.lg },
    })
  );

  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace({
      pathname: "/(app)/settings/business-insights",
      params: { fy: String(selectedFy) },
    });
  };

  const openRecords = (pathname: string) => {
    router.push({
      pathname: pathname as never,
      params: { fy: String(selectedFy) },
    });
  };

  const title = category ? insightCategoryTitle(t, category) : t("businessInsights.title");
  const insights = data && category ? filterInsightsByCategory(data.insights, category) : [];
  const freshness = data
    ? translateInsightPhrases(data.freshnessPhrases, t) || data.freshnessSummary
    : "";
  const period = data?.fyLabel || formatFinancialYearLabel(selectedFy);

  return (
    <Screen scroll>
      <Header
        title={title}
        subtitle={category ? period : undefined}
        showBack
        onBackPress={goBack}
      />
      {!category ? (
        <LocaleUiText style={styles.intro}>{insightCategoryUnknown(t)}</LocaleUiText>
      ) : loading ? (
        <Loader message={t("common.loading")} />
      ) : error ? (
        <ErrorState message={error} onRetry={() => void reload()} retryLabel={t("common.retry")} />
      ) : !data ? (
        <Loader message={t("common.loading")} />
      ) : (
        <>
          <LocaleUiText style={styles.intro}>{insightCategoryHint(t, category)}</LocaleUiText>
          <LocaleUiText style={styles.freshness}>{freshness}</LocaleUiText>
          {category === "customers_parties" ? (
            <SettingsNavGroup>
              <InsightsCategoryRow
                icon="account-group-outline"
                title={t("businessInsights.partiesTitle")}
                subtitle={`${period} · ${t("businessInsights.partiesSubtitle")}`}
                value={String(data.parties.length)}
                actionLabel={t("businessInsights.viewSource")}
                onPress={() => openRecords("/(app)/settings/business-insights/parties")}
              />
              <InsightsCategoryRow
                icon="storefront-outline"
                title={t("businessInsights.customersTitle")}
                subtitle={`${period} · ${t("businessInsights.customersSubtitle")}`}
                value={String(data.customers.length)}
                actionLabel={t("businessInsights.viewSource")}
                onPress={() => openRecords("/(app)/settings/business-insights/customers")}
              />
              <InsightsCategoryRow
                icon="credit-card-outline"
                title={t("businessInsights.shopCreditTitle")}
                subtitle={`${period} · ${t("businessInsights.shopCreditSubtitle", {
                  active: data.creditActiveCount,
                  closed: data.creditClosedCount,
                })}`}
                actionLabel={t("businessInsights.viewSource")}
                onPress={() => openRecords("/(app)/settings/business-insights/customers")}
              />
            </SettingsNavGroup>
          ) : null}
          {insights.length > 0 ? (
            <View style={category === "customers_parties" ? styles.follow : undefined}>
              <ExplainableInsightList insights={insights} />
            </View>
          ) : null}
        </>
      )}
    </Screen>
  );
}
