import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { LuxuryPressable } from "@/components/ui/LuxuryPressable";
import { useT } from "@/i18n";
import type { ExplainableInsight, InsightSourceLink } from "@/services/insights/insightCoverage";
import { translateInsightPhrases, type InsightPhrase } from "@/services/insights/insightPhrases";
import { spacing, typography, useThemedStyles } from "@/theme";

export function ExplainableInsightList({
  insights,
  freshnessSummary,
  freshnessPhrases,
}: {
  insights: ExplainableInsight[];
  freshnessSummary: string;
  freshnessPhrases?: InsightPhrase[];
}) {
  const router = useRouter();
  const t = useT();
  const styles = useThemedStyles((c) =>
    StyleSheet.create({
      intro: { ...typography.caption, color: c.textMuted, lineHeight: 18, marginBottom: spacing.sm },
      card: {
        paddingVertical: spacing.md,
        paddingHorizontal: spacing.md,
        gap: 4,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: c.divider,
      },
      titleRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
      title: { ...typography.bodyStrong, color: c.text, flex: 1 },
      value: { ...typography.bodyStrong, color: c.primaryDark, textAlign: "right", maxWidth: "46%" },
      meta: { ...typography.caption, color: c.textMuted, lineHeight: 18 },
      link: { ...typography.captionStrong, color: c.primaryDark, marginTop: 2 },
    })
  );

  const open = (source: InsightSourceLink) => {
    router.push({
      pathname: source.pathname as never,
      params: source.params,
    });
  };

  const sentence = (phrases: InsightPhrase[] | undefined, fallback: string) =>
    phrases && phrases.length > 0 ? translateInsightPhrases(phrases, t) : fallback;
  const figure = (phrases: InsightPhrase[] | undefined, fallback: string) =>
    phrases && phrases.length > 0 ? translateInsightPhrases(phrases, t, " · ") : fallback;

  return (
    <View>
      <Text style={styles.intro}>{sentence(freshnessPhrases, freshnessSummary)}</Text>
      {insights.map((insight) => {
        const how = sentence(insight.howPhrases, insight.howCalculated);
        const empty = sentence(insight.emptyPhrases, insight.emptyState);
        return (
          <LuxuryPressable
            key={insight.id}
            tactile
            onPress={() => open(insight.source)}
            style={styles.card}
          >
            <View style={styles.titleRow}>
              <Text style={styles.title}>{sentence(insight.titlePhrases, insight.title)}</Text>
              <Text style={styles.value}>{figure(insight.valuePhrases, insight.valueLabel)}</Text>
            </View>
            <Text style={styles.meta}>{sentence(insight.periodPhrases, insight.periodLabel)}</Text>
            <Text style={styles.meta}>{how}</Text>
            {insight.empty && empty !== how ? <Text style={styles.meta}>{empty}</Text> : null}
            <Text style={styles.meta}>{sentence(insight.freshnessPhrases, insight.freshnessNote)}</Text>
            <Text style={styles.link}>{t("businessInsights.viewSource")}</Text>
          </LuxuryPressable>
        );
      })}
    </View>
  );
}
