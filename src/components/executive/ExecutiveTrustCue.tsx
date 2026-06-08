import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import React, { memo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { spacing, typography, useThemeColors, useThemedStyles } from "@/theme";

interface ExecutiveTrustCueProps {
  message: string;
  icon?: keyof typeof MaterialCommunityIcons.glyphMap;
}

/** Subtle trust cue — one line, no legal wall of text. */
function ExecutiveTrustCueInner({
  message,
  icon = "shield-check-outline",
}: ExecutiveTrustCueProps) {
  const colors = useThemeColors();
  const styles = useThemedStyles((c) =>
    StyleSheet.create({
      row: {
        flexDirection: "row",
        alignItems: "flex-start",
        gap: spacing.xs,
        paddingVertical: spacing.xs,
      },
      text: {
        flex: 1,
        ...typography.caption,
        color: c.textSubtle,
        lineHeight: 18,
      },
    })
  );

  return (
    <View style={styles.row}>
      <MaterialCommunityIcons name={icon} size={14} color={colors.textSubtle} />
      <Text style={styles.text}>{message}</Text>
    </View>
  );
}

export const ExecutiveTrustCue = memo(ExecutiveTrustCueInner);
