import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { radius, spacing, typography, useThemedStyles } from "@/theme";

export interface SettingsSegmentOption<T extends string> {
  id: T;
  label: string;
}

interface SettingsSegmentedControlProps<T extends string> {
  options: SettingsSegmentOption<T>[];
  value: T;
  onChange: (next: T) => void;
  accessibilityLabel?: string;
  /** Stretch segments evenly across the row. */
  fullWidth?: boolean;
  /** Smaller inline segments for dense preference rows. */
  dense?: boolean;
}

export function SettingsSegmentedControl<T extends string>({
  options,
  value,
  onChange,
  accessibilityLabel,
  fullWidth = false,
  dense = false,
}: SettingsSegmentedControlProps<T>) {
  const styles = useThemedStyles((c) =>
    StyleSheet.create({
      track: {
        flexDirection: "row",
        backgroundColor: c.surfaceMuted,
        borderRadius: radius.pill,
        padding: 2,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: c.divider,
        flexShrink: 1,
      },
      segment: {
        paddingVertical: dense ? 3 : 5,
        paddingHorizontal: dense ? 6 : spacing.sm,
        borderRadius: radius.pill,
        minWidth: dense ? 0 : 52,
        alignItems: "center",
        justifyContent: "center",
        ...(fullWidth || dense ? { flex: 1 } : {}),
      },
      trackFull: { alignSelf: "stretch" },
      segmentActive: { backgroundColor: c.primary },
      label: {
        ...typography.micro,
        color: c.textMuted,
        fontWeight: "500",
        fontSize: dense ? 10 : undefined,
      },
      labelActive: { color: c.primaryOn, fontWeight: "600" },
    })
  );

  return (
    <View
      style={[styles.track, fullWidth && styles.trackFull]}
      accessibilityRole="radiogroup"
      accessibilityLabel={accessibilityLabel}
    >
      {options.map((opt) => {
        const active = value === opt.id;
        return (
          <Pressable
            key={opt.id}
            onPress={() => void onChange(opt.id)}
            style={({ pressed }) => [
              styles.segment,
              active && styles.segmentActive,
              pressed && !active && { opacity: 0.88 },
            ]}
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}
            accessibilityLabel={opt.label}
          >
            <Text style={[styles.label, active && styles.labelActive]} numberOfLines={1}>
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
