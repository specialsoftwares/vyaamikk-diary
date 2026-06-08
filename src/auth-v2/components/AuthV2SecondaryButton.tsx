import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text } from "react-native";

import { useAuthV2Theme } from "@/auth-v2/hooks/useAuthV2Theme";
import { radius, typography } from "@/theme";

interface AuthV2SecondaryButtonProps {
  label: string;
  onPress?: () => void;
  disabled?: boolean;
  loading?: boolean;
  testID?: string;
}

export function AuthV2SecondaryButton({
  label,
  onPress,
  disabled = false,
  loading = false,
  testID,
}: AuthV2SecondaryButtonProps) {
  const { tokens } = useAuthV2Theme();
  const inactive = disabled || loading;

  return (
    <Pressable
      onPress={inactive ? undefined : onPress}
      disabled={inactive}
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy: loading }}
      style={({ pressed }) => [
        styles.btn,
        {
          borderColor: tokens.inputBorder,
          backgroundColor: tokens.ctaMutedBg,
          opacity: pressed && !inactive ? 0.9 : 1,
        },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={tokens.body} size="small" />
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
    paddingHorizontal: 24,
  },
  label: { ...typography.bodyStrong, fontSize: 16 },
});
