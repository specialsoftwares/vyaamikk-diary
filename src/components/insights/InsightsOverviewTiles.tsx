import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { useT } from "@/i18n";
import { executiveCardDepth, spacing, typography, useTheme, useThemedStyles } from "@/theme";

function Tile({ label, value }: { label: string; value: string }) {
  const { resolvedMode } = useTheme();
  const isDark = resolvedMode === "dark";
  const styles = useThemedStyles((c) =>
    StyleSheet.create({
      tile: {
        ...executiveCardDepth(isDark, c, 2),
        flexBasis: "48%",
        flexGrow: 1,
        padding: spacing.md + 2,
        gap: 4,
      },
      value: { ...typography.titleSm, color: c.primary },
      label: { ...typography.micro, color: c.textMuted },
    })
  );
  return (
    <View style={styles.tile}>
      <Text style={styles.value} numberOfLines={2}>
        {value}
      </Text>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

interface InsightsOverviewTilesProps {
  records: string;
  pdfs: string;
  cashPaid: string;
  distanceFy: string;
}

export function InsightsOverviewTiles({
  records,
  pdfs,
  cashPaid,
  distanceFy,
}: InsightsOverviewTilesProps) {
  const t = useT();
  const styles = useThemedStyles(() =>
    StyleSheet.create({
      grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
    })
  );
  return (
    <View style={styles.grid}>
      <Tile label={t("businessInsights.cardRecords")} value={records} />
      <Tile label={t("businessInsights.cardPdfs")} value={pdfs} />
      <Tile label={t("businessInsights.cashPaidFy")} value={cashPaid} />
      <Tile label={t("businessInsights.distanceFy")} value={distanceFy} />
    </View>
  );
}
