import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import React from "react";
import { StyleSheet, Text, View, type ViewStyle } from "react-native";

import { LocaleUiText } from "@/components/ui/LocaleUiText";
import {
  DASHBOARD_HEADLINE_BOTTOM,
  EXECUTIVE_SECTION_GAP,
} from "@/theme/executiveLayer";
import { spacing, typography, useThemedStyles } from "@/theme";
import type { CategoryAccentKey } from "@/theme/categoryAccents";
import { useCategoryAccent } from "@/theme/useBrandTokens";

interface SmartHeadlineProps {
  title: string;
  subtitle?: string;
  rightSlot?: React.ReactNode;
  style?: ViewStyle;
  /** Category accent for bar + icon tint (default brand/work). */
  accentKey?: CategoryAccentKey;
  /** Optional leading icon in accent ring. */
  iconName?: keyof typeof MaterialCommunityIcons.glyphMap;
  /** Tighter rhythm for You dashboard sections. */
  density?: "default" | "dashboard";
}

/**
 * Executive section headline — accent strip, icon ring, title + optional subtitle.
 */
export function SmartHeadline({
  title,
  subtitle,
  rightSlot,
  style,
  accentKey = "work",
  iconName,
  density = "default",
}: SmartHeadlineProps) {
  const accent = useCategoryAccent(accentKey);
  const headlineGap =
    density === "dashboard"
      ? { marginTop: 0, marginBottom: DASHBOARD_HEADLINE_BOTTOM }
      : {
          marginTop: EXECUTIVE_SECTION_GAP.before,
          marginBottom: EXECUTIVE_SECTION_GAP.after,
        };
  const styles = useThemedStyles((c) =>
    StyleSheet.create({
      wrap: {
        flexDirection: "row",
        alignItems: "flex-start",
        gap: spacing.md,
        ...headlineGap,
      },
      accent: {
        width: 3,
        borderRadius: 2,
        alignSelf: "stretch",
        minHeight: 32,
      },
      iconWrap: {
        width: 34,
        height: 34,
        borderRadius: 17,
        alignItems: "center",
        justifyContent: "center",
        marginTop: 1,
        borderWidth: StyleSheet.hairlineWidth,
      },
      textCol: { flex: 1, gap: EXECUTIVE_SECTION_GAP.titleSubtitle },
      title: {
        ...typography.titleMd,
        color: c.text,
        letterSpacing: -0.25,
      },
      subtitle: {
        ...typography.caption,
        color: c.textMuted,
        lineHeight: 18,
      },
    })
  );

  return (
    <View style={[styles.wrap, style]}>
      <View style={[styles.accent, { backgroundColor: accent.main }]} />
      {iconName ? (
        <View
          style={[
            styles.iconWrap,
            { backgroundColor: accent.soft, borderColor: accent.main + "28" },
          ]}
        >
          <MaterialCommunityIcons name={iconName} size={17} color={accent.main} />
        </View>
      ) : null}
      <View style={styles.textCol}>
        <LocaleUiText style={styles.title}>{title}</LocaleUiText>
        {subtitle ? <LocaleUiText style={styles.subtitle}>{subtitle}</LocaleUiText> : null}
      </View>
      {rightSlot}
    </View>
  );
}
