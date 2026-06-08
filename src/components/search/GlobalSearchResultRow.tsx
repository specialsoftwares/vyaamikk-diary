import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import React, { memo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { LuxuryPressable } from "@/components/ui/LuxuryPressable";
import type { GlobalSearchResult } from "@/services/search";
import { formatShortDate } from "@/utils/date";
import { executiveCardDepth } from "@/theme/cardDepth";
import { spacing, typography, useTheme, useThemedStyles } from "@/theme";
import { accentKeyForSearchCategory } from "@/theme/categoryAccentResolver";
import { useCategoryAccent } from "@/theme/useBrandTokens";
import { CategoryAccentChip } from "@/components/ui/CategoryAccentChip";

interface GlobalSearchResultRowProps {
  result: GlobalSearchResult;
  categoryLabel: string;
  onPress: () => void;
}

export const GlobalSearchResultRow = memo(function GlobalSearchResultRow({
  result,
  categoryLabel,
  onPress,
}: GlobalSearchResultRowProps) {
  const accentKey = accentKeyForSearchCategory(result.category);
  const accent = useCategoryAccent(accentKey);
  const { resolvedMode } = useTheme();
  const isDark = resolvedMode === "dark";
  const styles = useThemedStyles((c) =>
    StyleSheet.create({
      row: {
        ...executiveCardDepth(isDark, c, 3),
        flexDirection: "row",
        alignItems: "flex-start",
        gap: spacing.md,
        paddingVertical: spacing.md + 2,
        paddingHorizontal: spacing.md + 2,
        borderLeftWidth: 3,
      },
      iconWrap: {
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: "center",
        justifyContent: "center",
      },
      body: { flex: 1, gap: 2 },
      category: { ...typography.captionStrong, color: c.textMuted },
      title: { ...typography.bodyStrong, color: c.text },
      snippet: { ...typography.caption, color: c.textMuted },
      date: { ...typography.caption, color: c.textSubtle, marginTop: 2 },
    })
  );

  return (
    <LuxuryPressable
      onPress={onPress}
      style={[styles.row, { borderLeftColor: accent.main }]}
      accessibilityRole="button"
    >
      <View style={[styles.iconWrap, { backgroundColor: accent.soft }]}>
        <MaterialCommunityIcons
          name={result.iconName as keyof typeof MaterialCommunityIcons.glyphMap}
          size={20}
          color={accent.main}
        />
      </View>
      <View style={styles.body}>
        <CategoryAccentChip accentKey={accentKey} label={categoryLabel} compact />
        <Text style={styles.title} numberOfLines={1}>
          {result.title}
        </Text>
        {result.snippet ? (
          <Text style={styles.snippet} numberOfLines={2}>
            {result.snippet}
          </Text>
        ) : null}
        <Text style={styles.date}>{formatShortDate(result.dateMs)}</Text>
      </View>
    </LuxuryPressable>
  );
});
