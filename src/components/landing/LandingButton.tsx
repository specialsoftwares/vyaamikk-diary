import React from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { LANDING_COLORS } from "@/components/landing/landingTokens";
import { radius, spacing } from "@/theme";

interface LandingButtonProps {
  label: string;
  onPress: () => void;
  variant?: "primary" | "ghost";
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

export function LandingButton({
  label,
  onPress,
  variant = "primary",
  disabled = false,
  loading = false,
  style,
  accessibilityLabel,
}: LandingButtonProps) {
  const isPrimary = variant === "primary";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        isPrimary ? styles.primary : styles.ghost,
        pressed && styles.pressed,
        disabled && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={isPrimary ? LANDING_COLORS.ctaPrimaryText : "#FFFFFF"} />
      ) : (
        <Text style={[styles.label, isPrimary ? styles.labelPrimary : styles.labelGhost]}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 48,
    paddingHorizontal: spacing.xl,
    paddingVertical: 12,
    borderRadius: radius.lg,
    alignItems: "center",
    justifyContent: "center",
    ...(Platform.OS === "web"
      ? ({ cursor: "pointer", transitionProperty: "opacity, transform", transitionDuration: "180ms" } as object)
      : null),
  },
  primary: {
    backgroundColor: LANDING_COLORS.ctaPrimaryBg,
  },
  ghost: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: LANDING_COLORS.ctaGhostBorder,
  },
  pressed: {
    opacity: 0.88,
    transform: [{ scale: 0.985 }],
  },
  disabled: {
    opacity: 0.45,
  },
  label: {
    fontSize: 15,
    fontWeight: "600",
    letterSpacing: 0.2,
  },
  labelPrimary: {
    color: LANDING_COLORS.ctaPrimaryText,
  },
  labelGhost: {
    color: LANDING_COLORS.textPrimary,
  },
});
