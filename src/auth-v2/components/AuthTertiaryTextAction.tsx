import React from "react";
import { Pressable, StyleSheet, Text, type StyleProp, type TextStyle, type ViewStyle } from "react-native";

import {
  ACTION_MIN_TARGET_DP,
  ACTION_PRESS_OPACITY,
  resolveActionInteraction,
  type ActionPurpose,
} from "@/actionSystem";
import { useAuthV2Theme } from "@/auth-v2/hooks/useAuthV2Theme";
import { spacing, typography } from "@/theme";

export interface AuthTertiaryTextActionProps {
  label: string;
  onPress?: () => void;
  disabled?: boolean;
  loading?: boolean;
  testID?: string;
  accessibilityLabel?: string;
  /** recover = Resend/Try again; navigate = Cancel/Change number/Not now */
  purpose?: Extract<ActionPurpose, "retry" | "navigate">;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
}

/**
 * Tertiary / recovery text action with truthful enabled/disabled appearance.
 * Uses secondaryAction tokens — never unsafe `tokens.link`.
 */
export function AuthTertiaryTextAction({
  label,
  onPress,
  disabled = false,
  loading = false,
  testID,
  accessibilityLabel,
  purpose = "navigate",
  style,
  textStyle,
}: AuthTertiaryTextActionProps) {
  void purpose;
  const { tokens } = useAuthV2Theme();
  const interaction = resolveActionInteraction({ disabled, loading });
  const enabledColor =
    purpose === "navigate" ? tokens.tertiaryAction : tokens.secondaryAction;
  const color = interaction.pressable ? enabledColor : tokens.secondaryActionMuted;

  return (
    <Pressable
      onPress={interaction.pressable ? onPress : undefined}
      disabled={!interaction.pressable}
      testID={testID}
      accessibilityRole={interaction.accessibilityRole}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={interaction.accessibilityState}
      hitSlop={8}
      style={({ pressed }) => [
        styles.hit,
        style,
        pressed && interaction.pressable ? { opacity: ACTION_PRESS_OPACITY } : null,
      ]}
    >
      <Text style={[styles.label, { color }, textStyle]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hit: {
    minHeight: ACTION_MIN_TARGET_DP,
    minWidth: ACTION_MIN_TARGET_DP,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
  },
  label: { ...typography.captionStrong },
});
