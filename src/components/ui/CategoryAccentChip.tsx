import React, { memo } from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { radius, spacing, typography, useThemeColors } from "@/theme";
import type { CategoryAccentKey } from "@/theme/categoryAccents";
import { useCategoryAccent } from "@/theme/useBrandTokens";

interface CategoryAccentChipProps {
  accentKey: CategoryAccentKey;
  label: string;
  /** Show a 3px left accent strip (list rows, composer). */
  strip?: boolean;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
}

function CategoryAccentChipInner({
  accentKey,
  label,
  strip = false,
  compact = false,
  style,
}: CategoryAccentChipProps) {
  const accent = useCategoryAccent(accentKey);
  const colors = useThemeColors();

  return (
    <View
      style={[
        styles.chip,
        compact ? styles.chipCompact : null,
        {
          backgroundColor: accent.soft,
          borderLeftWidth: strip ? 3 : 0,
          borderLeftColor: accent.main,
        },
        style,
      ]}
    >
      <Text
        style={[
          compact ? typography.micro : typography.captionStrong,
          styles.label,
          { color: colors.text },
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    alignSelf: "flex-start",
    paddingVertical: 2,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
    maxWidth: "100%",
  },
  chipCompact: {
    paddingVertical: 1,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  label: { letterSpacing: 0.2 },
});

export const CategoryAccentChip = memo(CategoryAccentChipInner);
