import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { Header, Loader, Screen, LocaleUiText, ErrorState } from "@/components/ui";
import { useBusinessInsightsDashboard } from "@/hooks/useBusinessInsightsDashboard";
import { useAuth } from "@/state/auth";
import { useT } from "@/i18n";
import { formatShortDate } from "@/utils/date";
import { getCurrentFinancialYear } from "@/utils/financialYear";
import { spacing, typography, useThemedStyles } from "@/theme";

export default function InsightsPartiesScreen() {
  const t = useT();
  const router = useRouter();
  const { user } = useAuth();
  const { fy } = useLocalSearchParams<{ fy?: string }>();
  const selectedFy = fy ? Number(fy) : getCurrentFinancialYear();
  const { data, loading, error, reload } = useBusinessInsightsDashboard(user?.uid, user?.ueid, selectedFy);

  const styles = useThemedStyles((c) =>
    StyleSheet.create({
      row: {
        paddingVertical: spacing.sm,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: c.divider,
        gap: 2,
      },
      name: { ...typography.bodyStrong, color: c.text },
      meta: { ...typography.caption, color: c.textMuted },
      empty: { ...typography.body, color: c.textSubtle, marginTop: spacing.md },
    })
  );

  return (
    <Screen scroll>
      <Header title={t("businessInsights.partiesTitle")} showBack onBackPress={() => router.back()} />
      {loading ? (
        <Loader message={t("common.loading")} />
      ) : error ? (
        <ErrorState message={error} onRetry={() => void reload()} retryLabel={t("common.retry")} />
      ) : !data ? (
        <Loader message={t("common.loading")} />
      ) : data.parties.length === 0 ? (
        <LocaleUiText style={styles.empty}>{t("businessInsights.emptyList")}</LocaleUiText>
      ) : (
        data.parties.map((p) => (
          <View key={p.id} style={styles.row}>
            <Text style={styles.name}>{p.partyName}</Text>
            <Text style={styles.meta}>
              {[
                p.pin ? `PIN ${p.pin}` : null,
                p.locationLabel,
                t("businessInsights.recordCount", { count: p.recordCount }),
                t("businessInsights.lastUsed", { date: formatShortDate(p.lastUsedAt) }),
              ]
                .filter(Boolean)
                .join(" · ")}
            </Text>
          </View>
        ))
      )}
    </Screen>
  );
}
