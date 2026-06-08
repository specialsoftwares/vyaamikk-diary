import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { LedgerJaaliPattern } from "@/components/signature/LedgerJaaliPattern";
import { executiveCardDepth } from "@/theme/cardDepth";
import { spacing, typography, useTheme, useThemedStyles } from "@/theme";
import type { CategoryAccentKey } from "@/theme/categoryAccents";
import { useCategoryAccent } from "@/theme/useBrandTokens";
import { SIGNATURE_PATTERN_OPACITY } from "@/theme/signatureLayer";
import { LocaleUiText } from "./LocaleUiText";
import { Button } from "./Button";
import { SubtlePatternCorner } from "./SubtlePatternCorner";

interface EmptyStateProps {
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
  accentKey?: CategoryAccentKey;
  iconName?: keyof typeof MaterialCommunityIcons.glyphMap;
}

export function EmptyState({
  title,
  message,
  actionLabel,
  onAction,
  accentKey = "work",
  iconName = "notebook-outline",
}: EmptyStateProps) {
  const accent = useCategoryAccent(accentKey);
  const { colors, resolvedMode } = useTheme();
  const isDark = resolvedMode === "dark";
  const depth = executiveCardDepth(isDark, colors, 2);

  const styles = useThemedStyles((c) =>
    StyleSheet.create({
      container: {
        ...depth,
        alignItems: "center",
        justifyContent: "center",
        paddingVertical: spacing.xxxl,
        paddingHorizontal: spacing.xl,
        gap: spacing.sm,
        position: "relative",
        overflow: "hidden",
        backgroundColor: isDark ? c.surfaceMuted : c.surface,
      },
      iconRing: {
        width: 60,
        height: 60,
        borderRadius: 30,
        alignItems: "center",
        justifyContent: "center",
        marginBottom: spacing.sm,
        borderWidth: StyleSheet.hairlineWidth,
      },
      title: { ...typography.titleMd, color: c.text, textAlign: "center" },
      message: {
        ...typography.body,
        color: c.textMuted,
        textAlign: "center",
        lineHeight: 22,
        maxWidth: 320,
      },
      actionWrap: { marginTop: spacing.md },
    })
  );
  return (
    <View style={styles.container}>
      <LedgerJaaliPattern
        opacity={SIGNATURE_PATTERN_OPACITY.empty}
        color={accent.main}
        variant="jaali"
        style={{ opacity: 1 }}
      />
      <SubtlePatternCorner
        corner="bottomRight"
        opacity={SIGNATURE_PATTERN_OPACITY.corner}
        color={accent.main}
      />
      <View
        style={[
          styles.iconRing,
          { backgroundColor: accent.soft, borderColor: accent.main + "33" },
        ]}
      >
        <MaterialCommunityIcons name={iconName} size={26} color={accent.main} />
      </View>
      <LocaleUiText style={styles.title}>{title}</LocaleUiText>
      {message ? <LocaleUiText style={styles.message}>{message}</LocaleUiText> : null}
      {actionLabel && onAction ? (
        <View style={styles.actionWrap}>
          <Button label={actionLabel} onPress={onAction} variant="secondary" fullWidth={false} />
        </View>
      ) : null}
    </View>
  );
}
