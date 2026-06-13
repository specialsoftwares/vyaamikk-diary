import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { Header, Loader, Screen, LocaleUiText, ErrorState } from "@/components/ui";
import { useBusinessInsightsDashboard } from "@/hooks/useBusinessInsightsDashboard";
import { useAuth } from "@/state/auth";
import { useT } from "@/i18n";
import { getCurrentFinancialYear } from "@/utils/financialYear";
import { formatAmount } from "@/utils/formatters/formatAmount";
import { spacing, typography, useThemedStyles } from "@/theme";

function fmtMoney(v: number) {
  return formatAmount(v, { maximumFractionDigits: 0 });
}

export default function InsightsCashPaidScreen() {
  const t = useT();
  const router = useRouter();
  const { user } = useAuth();
  const { fy } = useLocalSearchParams<{ fy?: string }>();
  const selectedFy = fy ? Number(fy) : getCurrentFinancialYear();
  const { data, loading, error, reload } = useBusinessInsightsDashboard(user?.uid, user?.ueid, selectedFy);

  const styles = useThemedStyles((c) =>
    StyleSheet.create({
      lead: { ...typography.titleSm, color: c.primary, marginBottom: spacing.xs },
      sub: { ...typography.caption, color: c.textMuted, marginBottom: spacing.lg },
      row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6 },
      name: { ...typography.body, color: c.text, flex: 1 },
      count: { ...typography.caption, color: c.textMuted },
      note: { ...typography.caption, color: c.textSubtle, marginTop: spacing.lg, lineHeight: 18 },
    })
  );

  const cash = data?.cashPaid;

  return (
    <Screen scroll>
      <Header title={t("businessInsights.cashPaidTitle")} showBack onBackPress={() => router.back()} />
      {loading ? (
        <Loader message={t("common.loading")} />
      ) : error ? (
        <ErrorState message={error} onRetry={() => void reload()} retryLabel={t("common.retry")} />
      ) : !cash ? (
        <Loader message={t("common.loading")} />
      ) : (
        <>
          <Text style={styles.lead}>{fmtMoney(cash.fyTotal)}</Text>
          <LocaleUiText style={styles.sub}>
            {t("businessInsights.cashPaidMonth", { amount: fmtMoney(cash.monthTotal) })} ·{" "}
            {t("businessInsights.cashPaidCount", { count: cash.entryCount })}
          </LocaleUiText>
          {cash.topRecipients.map((r) => (
            <View key={r.name} style={styles.row}>
              <Text style={styles.name}>{r.name}</Text>
              <Text style={styles.count}>{r.count}</Text>
            </View>
          ))}
          <LocaleUiText style={styles.note}>{t("businessInsights.cashPaidDisclaimer")}</LocaleUiText>
        </>
      )}
    </Screen>
  );
}
