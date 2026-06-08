import React from "react";
import { StyleSheet, Text, View } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import type { ComponentProps } from "react";

import { LocaleUiText } from "@/components/ui/LocaleUiText";
import { LuxuryPressable } from "@/components/ui/LuxuryPressable";
import { executiveCardDepth } from "@/theme/cardDepth";
import { radius, spacing, typography, useTheme, useThemedStyles } from "@/theme";

type IconName = ComponentProps<typeof MaterialCommunityIcons>["name"];

interface SettingsNavCardProps {
  icon: IconName;
  title: string;
  subtitle?: string;
  onPress?: () => void;
  accent?: "primary" | "statutory" | "danger";
  external?: boolean;
  /** Row inside a grouped card — no per-row elevation. */
  embedded?: boolean;
}

export function SettingsNavCard({
  icon,
  title,
  subtitle,
  onPress,
  accent = "primary",
  external,
  embedded = false,
}: SettingsNavCardProps) {
  const { colors, resolvedMode } = useTheme();
  const isDark = resolvedMode === "dark";
  const depth = embedded ? {} : executiveCardDepth(isDark, colors, 2);

  const ringBg =
    accent === "statutory"
      ? isDark
        ? "rgba(245, 158, 11, 0.2)"
        : "rgba(30, 58, 95, 0.12)"
      : accent === "danger"
        ? colors.dangerSoft
        : colors.primaryLight;

  const iconColor =
    accent === "statutory" ? (isDark ? "#F59E0B" : "#1E3A5F") : colors.primaryDark;

  const styles = useThemedStyles((c) =>
    StyleSheet.create({
      card: {
        ...(embedded ? {} : depth),
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.md,
        paddingVertical: spacing.md,
        paddingHorizontal: spacing.md,
        backgroundColor: embedded ? "transparent" : undefined,
      },
      ring: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: ringBg,
        alignItems: "center",
        justifyContent: "center",
      },
      copy: { flex: 1, gap: 2 },
      title: { ...typography.bodyStrong, color: c.text },
      titleDanger: { color: c.danger },
      subtitle: { ...typography.caption, color: c.textMuted, lineHeight: 18 },
      chevron: { ...typography.titleSm, color: c.textSubtle },
    })
  );

  return (
    <LuxuryPressable
      onPress={onPress}
      disabled={!onPress}
      tactile={Boolean(onPress)}
      style={styles.card}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: !onPress }}
    >
      <View style={styles.ring}>
        <MaterialCommunityIcons name={icon} size={22} color={iconColor} />
      </View>
      <View style={styles.copy}>
        <LocaleUiText style={[styles.title, accent === "danger" && styles.titleDanger]}>
          {title}
        </LocaleUiText>
        {subtitle ? <LocaleUiText style={styles.subtitle}>{subtitle}</LocaleUiText> : null}
      </View>
      <Text style={styles.chevron}>{external ? "↗" : "›"}</Text>
    </LuxuryPressable>
  );
}

interface SettingsNavGroupProps {
  children: React.ReactNode;
}

export function SettingsNavGroup({ children }: SettingsNavGroupProps) {
  const { colors, resolvedMode } = useTheme();
  const depth = executiveCardDepth(resolvedMode === "dark", colors, 2);
  const styles = useThemedStyles(() =>
    StyleSheet.create({
      group: {
        ...depth,
        borderRadius: radius.lg,
        overflow: "hidden",
        gap: 0,
      },
      divider: {
        height: StyleSheet.hairlineWidth,
        backgroundColor: colors.divider,
        marginLeft: 44 + spacing.md + spacing.md,
      },
    })
  );

  const items = React.Children.toArray(children);
  return (
    <View style={styles.group}>
      {items.map((child, i) => (
        <React.Fragment key={i}>
          {child}
          {i < items.length - 1 ? <View style={styles.divider} /> : null}
        </React.Fragment>
      ))}
    </View>
  );
}
