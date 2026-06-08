import React from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { LuxuryPressable } from "@/components/ui/LuxuryPressable";
import { luxuryPlatinumAccent } from "@/theme/luxuryTokens";
import { radius, spacing, typography, useTheme, useThemedStyles } from "@/theme";

interface IndigoChoiceChipProps {
  label: string;
  selected: boolean;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
}

/** Premium indigo pill for binary / enum choices on forms. */
export function IndigoChoiceChip({ label, selected, onPress, style }: IndigoChoiceChipProps) {
  const { resolvedMode } = useTheme();
  const isDark = resolvedMode === "dark";
  const styles = useThemedStyles((c) =>
    StyleSheet.create({
      chip: {
        paddingVertical: 8,
        paddingHorizontal: spacing.md + 2,
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: c.divider,
        backgroundColor: c.surfaceMuted,
      },
      chipOn: {
        borderColor: luxuryPlatinumAccent(isDark),
        backgroundColor: c.primaryLight,
      },
      text: { ...typography.captionStrong, color: c.text },
      textOn: { color: c.primaryDark },
    })
  );

  return (
    <LuxuryPressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={style}
    >
      <View style={[styles.chip, selected && styles.chipOn]}>
        <Text style={[styles.text, selected && styles.textOn]}>{label}</Text>
      </View>
    </LuxuryPressable>
  );
}

interface IndigoChoiceChipRowProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

export function IndigoChoiceChipRow({ children, style }: IndigoChoiceChipRowProps) {
  return (
    <View style={[{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }, style]}>
      {children}
    </View>
  );
}
