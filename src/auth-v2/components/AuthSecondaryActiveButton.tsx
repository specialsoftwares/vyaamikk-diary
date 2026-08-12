import React from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import {
  ACTION_MIN_TARGET_DP,
  ACTION_PRESS_OPACITY,
  resolveActionInteraction,
  resolveActionLoadingLabel,
  resolveAuthSecondaryActiveAppearance,
  shouldRetainLoadingContext,
  type ActionPurpose,
} from "@/actionSystem";
import { radius, typography } from "@/theme";

export interface AuthSecondaryActiveButtonProps {
  label: string;
  onPress?: () => void;
  disabled?: boolean;
  loading?: boolean;
  loadingLabel?: string;
  testID?: string;
  accessibilityLabel?: string;
  purpose?: ActionPurpose;
  style?: StyleProp<ViewStyle>;
}

/**
 * Full-width secondary-active CTA (Choose logo / Change logo / similar).
 * Uses fixed periwinkle secondaryActive tokens — not `tokens.link`.
 */
export function AuthSecondaryActiveButton({
  label,
  onPress,
  disabled = false,
  loading = false,
  loadingLabel,
  testID,
  accessibilityLabel,
  purpose = "modify",
  style,
}: AuthSecondaryActiveButtonProps) {
  void purpose;
  const interaction = resolveActionInteraction({ disabled, loading });
  const retain = shouldRetainLoadingContext({ loading, loadingLabel });
  const displayLabel = resolveActionLoadingLabel({ label, loading, loadingLabel });

  return (
    <Pressable
      onPress={interaction.pressable ? onPress : undefined}
      disabled={!interaction.pressable}
      testID={testID}
      accessibilityRole={interaction.accessibilityRole}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={interaction.accessibilityState}
      style={({ pressed }) => {
        const appearance = resolveAuthSecondaryActiveAppearance(
          !interaction.pressable ? "disabled" : pressed ? "pressed" : loading ? "loading" : "default"
        );
        return [
          styles.btn,
          {
            borderColor: appearance.borderColor,
            backgroundColor: appearance.backgroundColor,
            opacity: pressed && interaction.pressable ? ACTION_PRESS_OPACITY : 1,
          },
          style,
        ];
      }}
    >
      {({ pressed }) => {
        const appearance = resolveAuthSecondaryActiveAppearance(
          !interaction.pressable ? "disabled" : pressed ? "pressed" : loading ? "loading" : "default"
        );
        if (loading) {
          return (
            <>
              <ActivityIndicator color={appearance.color} size="small" />
              {retain ? (
                <Text style={[styles.label, { color: appearance.color }]}>{displayLabel}</Text>
              ) : null}
            </>
          );
        }
        return <Text style={[styles.label, { color: appearance.color }]}>{label}</Text>;
      }}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    minHeight: Math.max(52, ACTION_MIN_TARGET_DP),
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 24,
    width: "100%",
  },
  label: { ...typography.bodyStrong, fontSize: 16 },
});
