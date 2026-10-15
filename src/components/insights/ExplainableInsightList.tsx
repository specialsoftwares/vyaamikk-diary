import React, { useState } from "react";
import { StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";

import { LocaleUiText } from "@/components/ui/LocaleUiText";
import { LuxuryPressable } from "@/components/ui/LuxuryPressable";
import { useT } from "@/i18n";
import { insightCaveatPhrases, insightRowScanLimitPhrases } from "@/services/insights/insightCategories";
import type { ExplainableInsight, InsightSourceLink } from "@/services/insights/insightCoverage";
import { translateInsightPhrases, type InsightPhrase } from "@/services/insights/insightPhrases";
import { executiveCardDepth, radius, spacing, typography, useTheme, useThemedStyles } from "@/theme";

function sentence(
  phrases: InsightPhrase[] | undefined,
  fallback: string,
  t: (key: string, vars?: Record<string, string | number>) => string,
  joiner = " "
) {
  return phrases && phrases.length > 0 ? translateInsightPhrases(phrases, t, joiner) : fallback;
}

function InsightFigureRow({
  insight,
  divided,
  onOpenSource,
}: {
  insight: ExplainableInsight;
  divided: boolean;
  onOpenSource: (source: InsightSourceLink) => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const styles = useThemedStyles((c) =>
    StyleSheet.create({
      card: {
        paddingVertical: spacing.md,
        paddingHorizontal: spacing.md,
        gap: spacing.xs,
        borderTopWidth: divided ? StyleSheet.hairlineWidth : 0,
        borderTopColor: c.divider,
      },
      title: { ...typography.bodyStrong, color: c.text },
      value: { ...typography.bodyStrong, color: c.primaryDark },
      meta: { ...typography.caption, color: c.textMuted },
      hit: { paddingVertical: spacing.sm },
      link: { ...typography.captionStrong, color: c.primaryDark },
    })
  );

  const title = sentence(insight.titlePhrases, insight.title, t);
  const value = sentence(insight.valuePhrases, insight.valueLabel, t, " · ");
  const period = sentence(insight.periodPhrases, insight.periodLabel, t);
  const how = sentence(insight.howPhrases, insight.howCalculated, t);
  const empty = sentence(insight.emptyPhrases, insight.emptyState, t);
  const status = insight.unavailable || insight.empty ? empty : "";
  const caveat = sentence(insightCaveatPhrases(insight), "", t);
  const scan = sentence(insightRowScanLimitPhrases(insight), "", t);
  const showHow = Boolean(how) && how !== status;

  return (
    <View style={styles.card}>
      <LocaleUiText style={styles.title}>{title}</LocaleUiText>
      <LocaleUiText style={styles.value}>{value}</LocaleUiText>
      <LocaleUiText style={styles.meta}>{period}</LocaleUiText>
      {status ? <LocaleUiText style={styles.meta}>{status}</LocaleUiText> : null}
      {caveat ? <LocaleUiText style={styles.meta}>{caveat}</LocaleUiText> : null}
      {scan ? <LocaleUiText style={styles.meta}>{scan}</LocaleUiText> : null}
      {showHow ? (
        <LuxuryPressable
          onPress={() => setOpen((current) => !current)}
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          style={styles.hit}
        >
          <LocaleUiText style={styles.link}>{t("businessInsights.howCounted")}</LocaleUiText>
        </LuxuryPressable>
      ) : null}
      {open && showHow ? <LocaleUiText style={styles.meta}>{how}</LocaleUiText> : null}
      <LuxuryPressable
        onPress={() => onOpenSource(insight.source)}
        accessibilityRole="button"
        style={styles.hit}
      >
        <LocaleUiText style={styles.link}>{t("businessInsights.viewSource")}</LocaleUiText>
      </LuxuryPressable>
    </View>
  );
}

export function ExplainableInsightList({ insights }: { insights: ExplainableInsight[] }) {
  const router = useRouter();
  const { resolvedMode } = useTheme();
  const styles = useThemedStyles((c) =>
    StyleSheet.create({
      group: {
        ...executiveCardDepth(resolvedMode === "dark", c, 2),
        borderRadius: radius.lg,
        overflow: "hidden",
      },
    })
  );

  if (insights.length === 0) return null;

  const open = (source: InsightSourceLink) => {
    router.push({
      pathname: source.pathname as never,
      params: source.params,
    });
  };

  return (
    <View style={styles.group}>
      {insights.map((insight, index) => (
        <InsightFigureRow
          key={insight.id}
          insight={insight}
          divided={index > 0}
          onOpenSource={open}
        />
      ))}
    </View>
  );
}
