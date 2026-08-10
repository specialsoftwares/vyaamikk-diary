import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text } from "react-native";

import { resolveAuthV2PrimaryChrome } from "@/auth-v2/components/authV2PrimaryButtonChrome";
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
  mutedBorder?: string;
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
  mutedBorder,
}: AuthV2PrimaryButtonProps) {
  const chrome = resolveAuthV2PrimaryChrome({ disabled, loading });
  const visuallyDisabled = chrome === "muted";
  const blocked = disabled || loading;
  const bg = visuallyDisabled ? mutedBg : activeBg;
  const fg = visuallyDisabled ? mutedText : activeText;

  return (
    <Pressable
      onPress={blocked ? undefined : onPress}
      disabled={blocked}
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ disabled: visuallyDisabled, busy: loading }}
      android_ripple={blocked ? undefined : { color: "rgba(15,23,42,0.12)" }}
      style={({ pressed }) => [
        styles.btn,
        {
          backgroundColor: bg,
          borderColor: visuallyDisabled && mutedBorder ? mutedBorder : "transparent",
          opacity: pressed && !blocked ? 0.92 : 1,
        },
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
    minHeight: 54,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 24,
    width: "100%",
    alignSelf: "center",
    borderWidth: 1,
  },
  label: {
    ...typography.bodyStrong,
    fontSize: 16,
    textAlign: "center",
  },
});
