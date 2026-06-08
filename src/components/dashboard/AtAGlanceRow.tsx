import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import React, { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { CategoryAccentChip } from "@/components/ui/CategoryAccentChip";
import type { AtAGlanceItem } from "@/services/dashboard";
import { formatShortDate } from "@/utils/date";
import { radius, spacing, typography, useThemedStyles } from "@/theme";
import { accentKeyFromTypeLabelKey } from "@/theme/categoryAccentResolver";
import { useCategoryAccent } from "@/theme/useBrandTokens";

interface AtAGlanceRowProps {
  item: AtAGlanceItem;
  typeLabel: string;
  dateLine: string;
  statusChip?: string;
  onPress: () => void;
}

export const AtAGlanceRow = memo(function AtAGlanceRow({
  item,
  typeLabel,
  dateLine,
  statusChip,
  onPress,
}: AtAGlanceRowProps) {
  const accentKey = accentKeyFromTypeLabelKey(item.typeLabelKey);
  const accent = useCategoryAccent(accentKey);
  const styles = useThemedStyles((c) =>
    StyleSheet.create({
      row: {
        flexDirection: "row",
        alignItems: "flex-start",
        gap: spacing.md,
        paddingVertical: spacing.md,
        paddingHorizontal: spacing.md,
        borderRadius: radius.lg,
        backgroundColor: c.surface,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: c.divider,
        borderLeftWidth: 3,
      },
      rowPressed: { opacity: 0.9 },
      iconWrap: {
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: "center",
        justifyContent: "center",
      },
      body: { flex: 1, gap: 2 },
      typeLabel: { ...typography.captionStrong },
      title: { ...typography.bodyStrong, color: c.text },
      snippet: { ...typography.caption, color: c.textMuted },
      metaRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: 2 },
      date: { ...typography.caption, color: c.textSubtle },
      chip: {
        paddingHorizontal: spacing.sm,
        paddingVertical: 2,
        borderRadius: radius.pill,
        backgroundColor: c.dangerSoft,
      },
      chipText: { ...typography.micro, color: c.danger },
    })
  );

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        { borderLeftColor: accent.main },
        pressed && styles.rowPressed,
      ]}
      accessibilityRole="button"
    >
      <View style={[styles.iconWrap, { backgroundColor: accent.soft }]}>
        <MaterialCommunityIcons
          name={item.iconName as keyof typeof MaterialCommunityIcons.glyphMap}
          size={20}
          color={accent.main}
        />
      </View>
      <View style={styles.body}>
        <CategoryAccentChip accentKey={accentKey} label={typeLabel} compact />
        <Text style={styles.title} numberOfLines={1}>
          {item.title}
        </Text>
        {item.snippet ? (
          <Text style={styles.snippet} numberOfLines={2}>
            {item.snippet}
          </Text>
        ) : null}
        <View style={styles.metaRow}>
          <Text style={styles.date}>{dateLine}</Text>
          {statusChip ? (
            <View style={styles.chip}>
              <Text style={styles.chipText}>{statusChip}</Text>
            </View>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
});
