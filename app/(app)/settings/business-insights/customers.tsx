import React, { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { Header, Loader, Screen, LocaleUiText } from "@/components/ui";
import { useBusinessInsightsDashboard } from "@/hooks/useBusinessInsightsDashboard";
import { useAuth } from "@/state/auth";
import { useT } from "@/i18n";
import { formatShortDate } from "@/utils/date";
import { getCurrentFinancialYear } from "@/utils/financialYear";
import { spacing, typography, useThemedStyles } from "@/theme";

type Filter = "all" | "active" | "closed" | "external";

export default function InsightsCustomersScreen() {
  const t = useT();
  const router = useRouter();
  const { user } = useAuth();
  const { fy } = useLocalSearchParams<{ fy?: string }>();
  const selectedFy = fy ? Number(fy) : getCurrentFinancialYear();
  const { data, loading } = useBusinessInsightsDashboard(user?.uid, user?.ueid, selectedFy);
  const [filter, setFilter] = useState<Filter>("all");

  const styles = useThemedStyles((c) =>
    StyleSheet.create({
      chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, marginBottom: spacing.md },
      chip: {
        paddingHorizontal: spacing.sm,
        paddingVertical: 6,
        borderRadius: 16,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: c.divider,
        backgroundColor: c.surfaceMuted,
      },
      chipOn: { borderColor: c.primary, backgroundColor: c.primaryLight },
      chipText: { ...typography.caption, color: c.textMuted },
      chipTextOn: { color: c.primaryDark },
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

  const rows = useMemo(() => {
    if (!data) return [];
    if (filter === "all") return data.customers;
    return data.customers.filter((c) => c.group === filter);
  }, [data, filter]);

  return (
    <Screen scroll>
      <Header title={t("businessInsights.customersTitle")} showBack onBackPress={() => router.back()} />
      <View style={styles.chips}>
        {(["all", "active", "closed", "external"] as Filter[]).map((f) => (
          <Pressable key={f} onPress={() => setFilter(f)}>
            <View style={[styles.chip, filter === f && styles.chipOn]}>
              <LocaleUiText style={[styles.chipText, filter === f && styles.chipTextOn]}>
                {t(`businessInsights.customerFilter.${f}`)}
              </LocaleUiText>
            </View>
          </Pressable>
        ))}
      </View>
      {loading || !data ? (
        <Loader message={t("common.loading")} />
      ) : rows.length === 0 ? (
        <LocaleUiText style={styles.empty}>{t("businessInsights.emptyCustomers")}</LocaleUiText>
      ) : (
        rows.map((c) => (
          <Pressable
            key={c.id}
            style={styles.row}
            onPress={() =>
              router.push({
                pathname: "/(app)/customer-credit/[id]",
                params: { id: c.id },
              })
            }
          >
            <Text style={styles.name}>{c.customerName}</Text>
            <Text style={styles.meta}>
              {c.mobileDisplay} · {c.statusLabel} ·{" "}
              {t("businessInsights.lastUsed", { date: formatShortDate(c.lastActivityAt) })}
            </Text>
          </Pressable>
        ))
      )}
    </Screen>
  );
}
