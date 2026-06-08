import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import React, { memo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { spacing, typography, useThemedStyles } from "@/theme";
import type { CategoryAccentKey } from "@/theme/categoryAccents";
import { useCategoryAccent } from "@/theme/useBrandTokens";

interface ExecutiveInlineEmptyProps {
  message: string;
  iconName?: keyof typeof MaterialCommunityIcons.glyphMap;
  accentKey?: CategoryAccentKey;
}

/** Compact empty hint for dashboard sections — not a full empty-state card. */
function ExecutiveInlineEmptyInner({
  message,
  iconName = "information-outline",
  accentKey = "work",
}: ExecutiveInlineEmptyProps) {
  const accent = useCategoryAccent(accentKey);
  const styles = useThemedStyles((c) =>
    StyleSheet.create({
      row: {
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.sm,
        paddingVertical: spacing.md,
        paddingHorizontal: spacing.md,
        borderRadius: 12,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: c.divider,
        backgroundColor: c.surfaceMuted,
      },
      iconRing: {
        width: 32,
        height: 32,
        borderRadius: 16,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: accent.main + "28",
        backgroundColor: accent.soft,
      },
      text: { flex: 1, ...typography.body, color: c.textMuted, lineHeight: 20 },
    })
  );

  return (
    <View style={styles.row}>
      <View style={styles.iconRing}>
        <MaterialCommunityIcons name={iconName} size={16} color={accent.main} />
      </View>
      <Text style={styles.text}>{message}</Text>
    </View>
  );
}

export const ExecutiveInlineEmpty = memo(ExecutiveInlineEmptyInner);
