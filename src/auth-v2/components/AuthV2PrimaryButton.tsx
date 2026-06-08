import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text } from "react-native";

import { radius, typography } from "@/theme";

interface AuthV2PrimaryButtonProps {
  label: string;
  onPress?: () => void;
  disabled?: boolean;
  loading?: boolean;
  loadingLabel?: string;
  testID?: string;
  activeBg: string;
  activeText: string;
  mutedBg: string;
  mutedText: string;
}

export function AuthV2PrimaryButton({
  label,
  onPress,
  disabled = false,
  loading = false,
  loadingLabel,
  testID,
  activeBg,
  activeText,
  mutedBg,
  mutedText,
}: AuthV2PrimaryButtonProps) {
  const inactive = disabled || loading;
  const bg = inactive ? mutedBg : activeBg;
  const fg = inactive ? mutedText : activeText;

  return (
    <Pressable
      onPress={inactive ? undefined : onPress}
      disabled={inactive}
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy: loading }}
      style={({ pressed }) => [
        styles.btn,
        { backgroundColor: bg, opacity: pressed && !inactive ? 0.92 : 1 },
      ]}
    >
      {loading ? (
        <>
          <ActivityIndicator color={fg} size="small" />
          <Text style={[styles.label, { color: fg }]}>{loadingLabel ?? label}</Text>
        </>
      ) : (
        <Text style={[styles.label, { color: fg }]}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    minHeight: 52,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 24,
  },
  label: {
    ...typography.bodyStrong,
    fontSize: 16,
  },
});
