import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { Header, Loader, Screen, LocaleUiText, ErrorState } from "@/components/ui";
import { useBusinessInsightsDashboard } from "@/hooks/useBusinessInsightsDashboard";
import { useAuth } from "@/state/auth";
import { useT } from "@/i18n";
import { getCurrentFinancialYear } from "@/utils/financialYear";
import { spacing, typography, useThemedStyles } from "@/theme";

export default function InsightsMovementScreen() {
  const t = useT();
  const router = useRouter();
  const { user } = useAuth();
  const { fy } = useLocalSearchParams<{ fy?: string }>();
  const selectedFy = fy ? Number(fy) : getCurrentFinancialYear();
  const { data, loading, error, reload } = useBusinessInsightsDashboard(user?.uid, user?.ueid, selectedFy);

  const styles = useThemedStyles((c) =>
    StyleSheet.create({
      tiles: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginBottom: spacing.lg },
      tile: {
        flexBasis: "48%",
        flexGrow: 1,
        padding: spacing.md,
        borderRadius: 12,
        backgroundColor: c.surfaceMuted,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: c.divider,
      },
      tileVal: { ...typography.titleSm, color: c.primary },
      tileLabel: { ...typography.micro, color: c.textMuted, marginTop: 4 },
      section: { ...typography.captionStrong, color: c.textMuted, marginTop: spacing.md, marginBottom: spacing.xs },
      row: { ...typography.body, color: c.text, paddingVertical: 6 },
      hint: { ...typography.caption, color: c.textSubtle, marginBottom: spacing.md, lineHeight: 18 },
      empty: { ...typography.caption, color: c.textSubtle },
    })
  );

  const d = data?.distance;

  return (
    <Screen scroll>
      <Header title={t("businessInsights.movementTitle")} showBack onBackPress={() => router.back()} />
      <LocaleUiText style={styles.hint}>{t("businessInsights.cardDistanceHint")}</LocaleUiText>
      {loading ? (
        <Loader message={t("common.loading")} />
      ) : error ? (
        <ErrorState message={error} onRetry={() => void reload()} retryLabel={t("common.retry")} />
      ) : !d ? (
        <Loader message={t("common.loading")} />
      ) : (
        <>
          <View style={styles.tiles}>
            <View style={styles.tile}>
              <LocaleUiText style={styles.tileVal}>{t("businessInsights.routeKm", { km: d.weekKm })}</LocaleUiText>
              <LocaleUiText style={styles.tileLabel}>{t("businessInsights.distanceWeek")}</LocaleUiText>
            </View>
            <View style={styles.tile}>
              <LocaleUiText style={styles.tileVal}>{t("businessInsights.routeKm", { km: d.monthKm })}</LocaleUiText>
              <LocaleUiText style={styles.tileLabel}>{t("businessInsights.distanceMonth")}</LocaleUiText>
            </View>
            <View style={styles.tile}>
              <LocaleUiText style={styles.tileVal}>{t("businessInsights.routeKm", { km: d.fyKm })}</LocaleUiText>
              <LocaleUiText style={styles.tileLabel}>{t("businessInsights.distanceFy")}</LocaleUiText>
            </View>
          </View>
          <LocaleUiText style={styles.section}>{t("businessInsights.sectionRoutes")}</LocaleUiText>
          {d.topRoutes.length === 0 ? (
            <LocaleUiText style={styles.empty}>{t("businessInsights.emptyRoutes")}</LocaleUiText>
          ) : (
            d.topRoutes.map((r) => (
              <Text key={r.route} style={styles.row}>
                {r.route}
                {r.km != null ? ` (${t("businessInsights.routeKm", { km: r.km })})` : ""} — {r.count}
              </Text>
            ))
          )}
          <LocaleUiText style={styles.section}>{t("businessInsights.topDestinations")}</LocaleUiText>
          {d.topDestinationPins.length === 0 ? (
            <LocaleUiText style={styles.empty}>{t("businessInsights.emptyList")}</LocaleUiText>
          ) : (
            d.topDestinationPins.map((p) => (
              <Text key={p.pin} style={styles.row}>
                {p.pin} · {p.label} — {p.count}
              </Text>
            ))
          )}
        </>
      )}
    </Screen>
  );
}
