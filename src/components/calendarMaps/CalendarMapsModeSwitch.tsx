import React, { memo, useCallback } from "react";
import {
  LayoutAnimation,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  UIManager,
  View,
} from "react-native";

import { executiveCardDepth } from "@/theme/cardDepth";
import { executivePressFeedback } from "@/theme/executiveLayer";
import { radius, spacing, typography, useTheme, useThemedStyles } from "@/theme";

export type CalendarMapsMode = "calendar" | "map";

if (
  Platform.OS === "android" &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface CalendarMapsModeSwitchProps {
  mode: CalendarMapsMode;
  onChange: (mode: CalendarMapsMode) => void;
  calendarLabel: string;
  mapLabel: string;
}

export const CalendarMapsModeSwitch = memo(function CalendarMapsModeSwitch({
  mode,
  onChange,
  calendarLabel,
  mapLabel,
}: CalendarMapsModeSwitchProps) {
  const { colors, resolvedMode } = useTheme();
  const isDark = resolvedMode === "dark";
  const trackDepth = executiveCardDepth(isDark, colors, 2);

  const styles = useThemedStyles((c) =>
    StyleSheet.create({
      row: {
        ...trackDepth,
        flexDirection: "row",
        marginHorizontal: spacing.lg,
        marginBottom: spacing.lg,
        padding: 4,
        borderRadius: radius.pill,
        backgroundColor: c.surfaceMuted,
      },
      chip: {
        flex: 1,
        paddingVertical: spacing.sm + 2,
        borderRadius: radius.pill,
        alignItems: "center",
        justifyContent: "center",
      },
      chipOn: {
        backgroundColor: c.surface,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: isDark ? "rgba(139, 145, 255, 0.22)" : "rgba(59, 65, 197, 0.12)",
        shadowColor: isDark ? "#000" : c.primaryDark,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: isDark ? 0.28 : 0.08,
        shadowRadius: 6,
        elevation: 2,
      },
      text: { ...typography.captionStrong, color: c.textMuted, letterSpacing: 0.2 },
      textOn: { ...typography.captionStrong, color: c.primaryDark },
    })
  );

  const select = useCallback(
    (next: CalendarMapsMode) => {
      if (next === mode) return;
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      onChange(next);
    },
    [mode, onChange]
  );

  return (
    <View style={styles.row}>
      <Pressable
        style={({ pressed }) => [
          styles.chip,
          mode === "calendar" && styles.chipOn,
          executivePressFeedback(pressed),
        ]}
        onPress={() => select("calendar")}
        accessibilityRole="tab"
        accessibilityState={{ selected: mode === "calendar" }}
      >
        <Text style={[styles.text, mode === "calendar" && styles.textOn]}>{calendarLabel}</Text>
      </Pressable>
      <Pressable
        style={({ pressed }) => [
          styles.chip,
          mode === "map" && styles.chipOn,
          executivePressFeedback(pressed),
        ]}
        onPress={() => select("map")}
        accessibilityRole="tab"
        accessibilityState={{ selected: mode === "map" }}
      >
        <Text style={[styles.text, mode === "map" && styles.textOn]}>{mapLabel}</Text>
      </Pressable>
    </View>
  );
});
