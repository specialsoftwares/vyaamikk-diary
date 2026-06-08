import React, { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import type { FyRecapSnapshot } from "@/domain/businessInsight";
import { Header, Loader, Screen, LocaleUiText } from "@/components/ui";
import { useAuth } from "@/state/auth";
import { useT } from "@/i18n";
import { formatFinancialYearLabel } from "@/utils/financialYear";
import { loadFyRecapSnapshot, formatRecapTitle } from "@/services/insights/fyRecapService";
import { spacing, typography, useThemedStyles } from "@/theme";

export default function FyRecapScreen() {
  const t = useT();
  const router = useRouter();
  const { user } = useAuth();
  const { fy } = useLocalSearchParams<{ fy: string }>();
  const fyStart = Number(fy);
  const [snap, setSnap] = useState<FyRecapSnapshot | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.uid || !Number.isFinite(fyStart)) {
      setLoading(false);
      return;
    }
    void loadFyRecapSnapshot(user.uid, fyStart).then((s) => {
      setSnap(s);
      setLoading(false);
    });
  }, [user?.uid, fyStart]);

  const styles = useThemedStyles((c) =>
    StyleSheet.create({
      title: { ...typography.titleSm, color: c.text, marginBottom: spacing.xs },
      status: { ...typography.caption, color: c.textMuted, marginBottom: spacing.lg },
      row: { ...typography.body, color: c.text, paddingVertical: 4 },
      section: {
        ...typography.captionStrong,
        color: c.textMuted,
        marginTop: spacing.md,
        marginBottom: spacing.xs,
        textTransform: "uppercase",
        letterSpacing: 0.5,
      },
    })
  );

  return (
    <Screen scroll>
      <Header
        title={t("businessInsights.recapScreenTitle")}
        showBack
        onBackPress={() => router.back()}
      />
      {loading ? (
        <Loader message={t("common.loading")} />
      ) : !snap ? (
        <LocaleUiText style={styles.status}>{t("businessInsights.recapUnavailable")}</LocaleUiText>
      ) : (
        <>
          <Text style={styles.title}>{formatRecapTitle(fyStart)}</Text>
          <Text style={styles.status}>
            {snap.status === "preparing"
              ? t("businessInsights.recapPreparingDetail", {
                  fy: formatFinancialYearLabel(fyStart),
                })
              : t("businessInsights.recapReady")}
          </Text>
          {snap.status === "ready" ? (
            <>
              <LocaleUiText style={styles.section}>{t("businessInsights.sectionOverview")}</LocaleUiText>
              <Text style={styles.row}>
                {t("businessInsights.cardRecords")}: {snap.recordsCreated}
              </Text>
              <Text style={styles.row}>
                {t("businessInsights.cardPdfs")}: {snap.pdfsGenerated}
              </Text>
              <Text style={styles.row}>
                {t("businessInsights.cashPaidTitle")}: ₹{snap.totalCashPaid}
              </Text>
              <Text style={styles.row}>
                {t("businessInsights.distanceFy")}:{" "}
                {t("businessInsights.routeKm", { km: snap.approxDistanceKm })}
              </Text>
              <LocaleUiText style={styles.section}>{t("businessInsights.sectionPeople")}</LocaleUiText>
              {snap.topParties.map((p) => (
                <Text key={p.name} style={styles.row}>
                  {p.name} — {p.count}
                </Text>
              ))}
              <LocaleUiText style={styles.section}>{t("businessInsights.pinsTitle")}</LocaleUiText>
              {snap.topPins.map((p) => (
                <Text key={p.pin} style={styles.row}>
                  {p.pin} · {p.label} — {p.count}
                </Text>
              ))}
            </>
          ) : null}
        </>
      )}
    </Screen>
  );
}
