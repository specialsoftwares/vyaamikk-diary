import React, { useEffect } from "react";
import { Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from "react-native";

import {
  ACTION_MIN_TARGET_DP,
  ACTION_PRESS_OPACITY,
  resolveActionInteraction,
  resolveAuthSecondaryActiveAppearance,
  type ActionPurpose,
} from "@/actionSystem";
import { logStage2ActionSystemProvenance } from "@/actionSystem/stage2RuntimeProvenance";
import { typography } from "@/theme";

export interface AuthSecondaryActiveChipProps {
  label: string;
  onPress?: () => void;
  disabled?: boolean;
  loading?: boolean;
  testID?: string;
  accessibilityLabel?: string;
  /** When true, hide from a11y tree (whole-card owns the action). */
  accessibilityElementsHidden?: boolean;
  purpose?: ActionPurpose;
  style?: StyleProp<ViewStyle>;
  minWidth?: number;
}

/**
 * Outlined Edit / Change chip — always uses dark-auth secondaryActive tokens.
 * Never uses `tokens.link` / device `primaryLight`.
 */
export function AuthSecondaryActiveChip({
  label,
  onPress,
  disabled = false,
  loading = false,
  testID,
  accessibilityLabel,
  accessibilityElementsHidden = false,
  purpose = "modify",
  style,
  minWidth = 72,
}: AuthSecondaryActiveChipProps) {
  void purpose;
  useEffect(() => {
    logStage2ActionSystemProvenance(`AuthSecondaryActiveChip:${label}`);
  }, [label]);
  const interaction = resolveActionInteraction({ disabled, loading });
  const appearanceFor = (pressed: boolean) =>
    resolveAuthSecondaryActiveAppearance(
      !interaction.pressable ? "disabled" : pressed ? "pressed" : "default"
    );

  return (
    <Pressable
      onPress={interaction.pressable ? onPress : undefined}
      disabled={!interaction.pressable}
      testID={testID}
      accessibilityRole={interaction.accessibilityRole}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={interaction.accessibilityState}
      accessibilityElementsHidden={accessibilityElementsHidden}
      importantForAccessibility={accessibilityElementsHidden ? "no-hide-descendants" : "yes"}
      hitSlop={4}
      style={({ pressed }) => {
        const appearance = appearanceFor(pressed && interaction.pressable);
        return [
          styles.chip,
          {
            minWidth,
            borderColor: appearance.borderColor,
            backgroundColor: appearance.backgroundColor,
            opacity: pressed && interaction.pressable ? ACTION_PRESS_OPACITY : 1,
          },
          style,
        ];
      }}
    >
      {({ pressed }) => {
        const appearance = appearanceFor(pressed && interaction.pressable);
        return (
          <Text style={[styles.label, { color: appearance.color }]}>{label}</Text>
        );
      }}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    minHeight: ACTION_MIN_TARGET_DP,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  label: { ...typography.bodyStrong, fontSize: 15 },
});
