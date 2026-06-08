import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { LocaleUiText } from "@/components/ui/LocaleUiText";
import { EXECUTIVE_SECTION_GAP } from "@/theme/executiveLayer";
import { spacing, typography, useThemedStyles } from "@/theme";

interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
}

/** List / dashboard section title with optional link action. */
export function SectionHeader({ title, subtitle, actionLabel, onAction }: SectionHeaderProps) {
  const styles = useThemedStyles((c) =>
    StyleSheet.create({
      wrap: {
        marginTop: EXECUTIVE_SECTION_GAP.before,
        marginBottom: EXECUTIVE_SECTION_GAP.after,
        gap: EXECUTIVE_SECTION_GAP.titleSubtitle,
      },
      row: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: spacing.sm,
      },
      title: {
        ...typography.captionStrong,
        color: c.textMuted,
        textTransform: "uppercase",
        letterSpacing: 0.55,
        fontWeight: "700",
        flex: 1,
      },
      subtitle: { ...typography.micro, color: c.textSubtle },
      action: { ...typography.captionStrong, color: c.primary },
    })
  );

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <LocaleUiText style={styles.title}>{title}</LocaleUiText>
        {actionLabel && onAction ? (
          <Pressable onPress={onAction} hitSlop={8} accessibilityRole="button">
            <LocaleUiText style={styles.action}>{actionLabel}</LocaleUiText>
          </Pressable>
        ) : null}
      </View>
      {subtitle ? <LocaleUiText style={styles.subtitle}>{subtitle}</LocaleUiText> : null}
    </View>
  );
}
