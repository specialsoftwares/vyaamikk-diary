import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";

import { dashboardRaisedSurface } from "@/components/you/dashboardSurface";
import { radius, spacing, typography, useTheme, useThemeColors, useThemedStyles } from "@/theme";
import type { CategoryAccentKey } from "@/theme/categoryAccents";
import { useCategoryAccent } from "@/theme/useBrandTokens";
import { executivePressFeedback } from "@/theme/executiveLayer";

interface DashboardPreviewRowProps {
  title: string;
  meta: string;
  subtitle?: string;
  onPress: () => void;
  iconName?: keyof typeof MaterialCommunityIcons.glyphMap;
  accentKey?: CategoryAccentKey;
  statusChip?: React.ReactNode;
}

export function DashboardPreviewRow({
  title,
  meta,
  subtitle,
  onPress,
  iconName = "file-document-outline",
  accentKey = "work",
  statusChip,
}: DashboardPreviewRowProps) {
  const colors = useThemeColors();
  const accent = useCategoryAccent(accentKey);
  const { colors: themeColors, resolvedMode } = useTheme();
  const isDark = resolvedMode === "dark";
  const raised = dashboardRaisedSurface(isDark, themeColors, "neutral");

  const styles = useThemedStyles((c) =>
    StyleSheet.create({
      row: {
        ...raised,
        flexDirection: "row",
        alignItems: "flex-start",
        gap: spacing.md,
        paddingVertical: spacing.md,
        paddingHorizontal: spacing.md,
        borderLeftWidth: 3,
      },
      rowPressed: {
        borderColor: isDark ? "rgba(255, 255, 255, 0.22)" : "rgba(15, 18, 38, 0.18)",
        backgroundColor: c.surfaceMuted,
      },
      iconWrap: {
        width: 40,
        height: 40,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: isDark ? "rgba(139, 145, 255, 0.28)" : "rgba(42, 65, 154, 0.14)",
        alignItems: "center",
        justifyContent: "center",
      },
      body: { flex: 1, gap: 4, minWidth: 0 },
      chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 2 },
      title: { ...typography.bodyStrong, color: c.text },
      meta: { ...typography.caption, color: c.textMuted },
      subtitle: { ...typography.caption, color: c.textSubtle, lineHeight: 18 },
      chevron: { marginTop: 6 },
    })
  );

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        { borderLeftColor: accent.main },
        pressed && [styles.rowPressed, executivePressFeedback(pressed)],
      ]}
      accessibilityRole="button"
    >
      <View style={[styles.iconWrap, { backgroundColor: accent.soft }]}>
        <MaterialCommunityIcons name={iconName} size={20} color={accent.main} />
      </View>
      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {statusChip ? <View style={styles.chipRow}>{statusChip}</View> : null}
        <Text style={styles.meta} numberOfLines={1}>
          {meta}
        </Text>
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      <MaterialCommunityIcons
        name="chevron-right"
        size={22}
        color={colors.textMuted}
        style={styles.chevron}
      />
    </Pressable>
  );
}
