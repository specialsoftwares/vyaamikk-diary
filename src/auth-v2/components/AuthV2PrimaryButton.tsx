import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text } from "react-native";

import {
  ACTION_PRESS_OPACITY,
  resolveActionInteraction,
  resolveActionLoadingLabel,
  type ActionPurpose,
} from "@/actionSystem";
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
  /** Optional semantic metadata — Stage 1 does not change chrome by itself. */
  purpose?: ActionPurpose;
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
  purpose: _purpose,
}: AuthV2PrimaryButtonProps) {
  const chrome = resolveAuthV2PrimaryChrome({ disabled, loading });
  const visuallyDisabled = chrome === "muted";
  const interaction = resolveActionInteraction({ disabled, loading });
  const bg = visuallyDisabled ? mutedBg : activeBg;
  const fg = visuallyDisabled ? mutedText : activeText;
  const displayLabel = resolveActionLoadingLabel({ label, loading, loadingLabel });

  return (
    <Pressable
      onPress={interaction.pressable ? onPress : undefined}
      disabled={!interaction.pressable}
      testID={testID}
      accessibilityRole={interaction.accessibilityRole}
      accessibilityState={interaction.accessibilityState}
      android_ripple={
        interaction.pressable ? { color: "rgba(15,23,42,0.12)" } : undefined
      }
      style={({ pressed }) => [
        styles.btn,
        {
          backgroundColor: bg,
          borderColor: visuallyDisabled && mutedBorder ? mutedBorder : "transparent",
          opacity: pressed && interaction.pressable ? ACTION_PRESS_OPACITY : 1,
        },
      ]}
    >
      {loading ? (
        <>
          <ActivityIndicator color={fg} size="small" />
          <Text style={[styles.label, { color: fg }]}>{displayLabel}</Text>
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
