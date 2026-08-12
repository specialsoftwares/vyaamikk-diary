import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text } from "react-native";

import {
  ACTION_PRESS_OPACITY,
  resolveActionInteraction,
  resolveActionLoadingLabel,
  shouldRetainLoadingContext,
  type ActionPurpose,
} from "@/actionSystem";
import { useAuthV2Theme } from "@/auth-v2/hooks/useAuthV2Theme";
import { radius, typography } from "@/theme";

interface AuthV2SecondaryButtonProps {
  label: string;
  onPress?: () => void;
  disabled?: boolean;
  loading?: boolean;
  /** When set with loading, spinner + label retain context. */
  loadingLabel?: string;
  testID?: string;
  /** Optional semantic metadata — Stage 1 does not change chrome by itself. */
  purpose?: ActionPurpose;
}

export function AuthV2SecondaryButton({
  label,
  onPress,
  disabled = false,
  loading = false,
  loadingLabel,
  testID,
  purpose: _purpose,
}: AuthV2SecondaryButtonProps) {
  const { tokens } = useAuthV2Theme();
  const interaction = resolveActionInteraction({ disabled, loading });
  const retainLoadingContext = shouldRetainLoadingContext({ loading, loadingLabel });
  const displayLabel = resolveActionLoadingLabel({ label, loading, loadingLabel });

  return (
    <Pressable
      onPress={interaction.pressable ? onPress : undefined}
      disabled={!interaction.pressable}
      testID={testID}
      accessibilityRole={interaction.accessibilityRole}
      accessibilityState={interaction.accessibilityState}
      style={({ pressed }) => [
        styles.btn,
        {
          borderColor: tokens.inputBorder,
          backgroundColor: tokens.ctaMutedBg,
          opacity: pressed && interaction.pressable ? ACTION_PRESS_OPACITY : 1,
        },
      ]}
    >
      {loading ? (
        <>
          <ActivityIndicator color={tokens.body} size="small" />
          {retainLoadingContext ? (
            <Text style={[styles.label, { color: tokens.body }]}>{displayLabel}</Text>
          ) : null}
        </>
      ) : (
        <Text style={[styles.label, { color: tokens.body }]}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    minHeight: 52,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 24,
  },
  label: { ...typography.bodyStrong, fontSize: 16 },
});
