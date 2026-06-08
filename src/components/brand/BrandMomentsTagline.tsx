import React from "react";
import { LocaleUiText } from "@/components/ui/LocaleUiText";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { useT } from "@/i18n";
import { spacing, typography, useThemedStyles } from "@/theme";

interface BrandMomentsTaglineProps {
  style?: StyleProp<ViewStyle>;
  /** Slightly smaller type for footers and boot splash. */
  compact?: boolean;
  align?: "center" | "left";
}

/**
 * Main tagline + supporting line for splash, login, intro, and About-adjacent moments.
 */
export function BrandMomentsTagline({
  style,
  compact = false,
  align = "center",
}: BrandMomentsTaglineProps) {
  const t = useT();
  const styles = useThemedStyles((c) =>
    StyleSheet.create({
      wrap: {
        gap: compact ? 4 : spacing.xs,
        alignItems: align === "center" ? "center" : "flex-start",
      },
      tagline: {
        ...(compact ? typography.captionStrong : typography.body),
        color: compact ? c.textMuted : c.text,
        lineHeight: compact ? 20 : 22,
        textAlign: align,
      },
      support: {
        ...typography.caption,
        color: c.textSubtle,
        lineHeight: 18,
        textAlign: align,
      },
    })
  );

  return (
    <View style={[styles.wrap, style]}>
      <LocaleUiText style={styles.tagline}>{t("app.tagline")}</LocaleUiText>
      <LocaleUiText style={styles.support}>{t("app.supportLine")}</LocaleUiText>
    </View>
  );
}
