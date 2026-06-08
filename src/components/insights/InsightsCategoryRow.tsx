import React from "react";
import { StyleSheet, Text, View } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import type { ComponentProps } from "react";

import { LuxuryPressable } from "@/components/ui/LuxuryPressable";
import { spacing, typography, useTheme, useThemedStyles } from "@/theme";

type IconName = ComponentProps<typeof MaterialCommunityIcons>["name"];

interface InsightsCategoryRowProps {
  icon: IconName;
  title: string;
  subtitle?: string;
  value?: string;
  onPress?: () => void;
}

export function InsightsCategoryRow({
  icon,
  title,
  subtitle,
  value,
  onPress,
}: InsightsCategoryRowProps) {
  const { colors } = useTheme();
  const styles = useThemedStyles((c) =>
    StyleSheet.create({
      row: {
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.md,
        paddingVertical: spacing.md + 2,
        paddingHorizontal: spacing.md + 2,
      },
      ring: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: c.primaryLight,
        alignItems: "center",
        justifyContent: "center",
      },
      copy: { flex: 1, gap: 2 },
      title: { ...typography.bodyStrong, color: c.text },
      subtitle: { ...typography.caption, color: c.textMuted, lineHeight: 18 },
      value: { ...typography.captionStrong, color: c.primaryDark },
      chevron: { ...typography.titleSm, color: c.textSubtle },
    })
  );

  return (
    <LuxuryPressable
      onPress={onPress}
      disabled={!onPress}
      tactile={Boolean(onPress)}
      style={styles.row}
    >
      <View style={styles.ring}>
        <MaterialCommunityIcons name={icon} size={20} color={colors.primaryDark} />
      </View>
      <View style={styles.copy}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {value ? <Text style={styles.value}>{value}</Text> : null}
      {onPress ? <Text style={styles.chevron}>›</Text> : null}
    </LuxuryPressable>
  );
}
