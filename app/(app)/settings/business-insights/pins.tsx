import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { Header, Loader, Screen, LocaleUiText } from "@/components/ui";
import { useBusinessInsightsDashboard } from "@/hooks/useBusinessInsightsDashboard";
import { useAuth } from "@/state/auth";
import { useT } from "@/i18n";
import { formatShortDate } from "@/utils/date";
import { getCurrentFinancialYear } from "@/utils/financialYear";
import { spacing, typography, useThemedStyles } from "@/theme";

export default function InsightsPinsScreen() {
  const t = useT();
  const router = useRouter();
  const { user } = useAuth();
  const { fy } = useLocalSearchParams<{ fy?: string }>();
  const selectedFy = fy ? Number(fy) : getCurrentFinancialYear();
  const { data, loading } = useBusinessInsightsDashboard(user?.uid, user?.ueid, selectedFy);

  const styles = useThemedStyles((c) =>
    StyleSheet.create({
      row: {
        paddingVertical: spacing.sm,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: c.divider,
        gap: 2,
      },
      pin: { ...typography.bodyStrong, color: c.text },
      meta: { ...typography.caption, color: c.textMuted, lineHeight: 18 },
      empty: { ...typography.body, color: c.textSubtle, marginTop: spacing.md },
    })
  );

  return (
    <Screen scroll>
      <Header title={t("businessInsights.pinsTitle")} showBack onBackPress={() => router.back()} />
      {loading || !data ? (
        <Loader message={t("common.loading")} />
      ) : data.pins.length === 0 ? (
        <LocaleUiText style={styles.empty}>{t("businessInsights.emptyPins")}</LocaleUiText>
      ) : (
        data.pins.map((p) => (
          <Pressable
            key={p.id}
            style={styles.row}
            onPress={() =>
              router.push({ pathname: "/(app)/search", params: { q: p.pin } })
            }
          >
            <Text style={styles.pin}>
              {p.pin} · {p.locationLabel}
            </Text>
            <Text style={styles.meta}>
              {p.parties.length
                ? t("businessInsights.pinParties", { names: p.parties.slice(0, 3).join(", ") })
                : null}
            </Text>
            <Text style={styles.meta}>
              {t("businessInsights.recordCount", { count: p.recordCount })} ·{" "}
              {t("businessInsights.lastUsed", { date: formatShortDate(p.lastUsedAt) })}
            </Text>
          </Pressable>
        ))
      )}
    </Screen>
  );
}
