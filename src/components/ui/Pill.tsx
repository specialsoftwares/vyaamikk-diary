import React from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { LocaleUiText } from "@/components/ui/LocaleUiText";
import { executivePressFeedback } from "@/theme/executiveLayer";
import { luxuryPlatinumAccent } from "@/theme/luxuryTokens";
import {
  radius,
  spacing,
  typography,
  useTheme,
  useThemedStyles,
  useThemeColors,
} from "@/theme";
import type { CategoryAccentKey } from "@/theme/categoryAccents";
import { useCategoryAccent } from "@/theme/useBrandTokens";

interface PillProps {
  label: string;
  active?: boolean;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  /** When active, tint with category accent instead of brand primary */
  accentKey?: CategoryAccentKey;
}

export function Pill({ label, active = false, onPress, style, accentKey }: PillProps) {
  const colors = useThemeColors();
  const { resolvedMode } = useTheme();
  const isDark = resolvedMode === "dark";
  const accent = useCategoryAccent(accentKey ?? "work");
  const styles = useThemedStyles((c) =>
    StyleSheet.create({
      pill: {
        paddingVertical: 7,
        paddingHorizontal: spacing.md + 2,
        borderRadius: radius.pill,
        borderWidth: 1,
      },
      pillIdle: { backgroundColor: c.surfaceMuted, borderColor: c.divider },
      pillActiveBrand: {
        backgroundColor: c.primary,
        borderColor: luxuryPlatinumAccent(isDark),
      },
      pillActiveAccent: {
        backgroundColor: accent.soft,
        borderColor: accent.main,
      },
    })
  );
  const activeStyle = accentKey && active ? styles.pillActiveAccent : styles.pillActiveBrand;
  const activeTextColor = accentKey && active ? colors.text : colors.primaryOn;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.pill,
        active ? activeStyle : styles.pillIdle,
        executivePressFeedback(pressed),
        style,
      ]}
    >
      <LocaleUiText
        style={[
          typography.captionStrong,
          { color: active ? activeTextColor : colors.textMuted },
        ]}
      >
        {label}
      </LocaleUiText>
    </Pressable>
  );
}
