import React from "react";
import {
  PremiumActionButton,
  type PremiumButtonSize,
  type PremiumButtonVariant,
} from "@/components/ui/PremiumActionButton";
import type { GestureResponderEvent, StyleProp, ViewStyle } from "react-native";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "md" | "lg";

interface ButtonProps {
  label: string;
  onPress?: (e: GestureResponderEvent) => void;
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  /** Passthrough — retains label context when set (Premium Action System contract). */
  loadingLabel?: string;
  disabled?: boolean;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  leftSlot?: React.ReactNode;
}

const VARIANT_MAP: Record<Variant, PremiumButtonVariant> = {
  primary: "primary",
  secondary: "secondary",
  ghost: "ghost",
  danger: "danger",
};

/**
 * App-wide button — delegates to `PremiumActionButton` for consistent
 * business-premium styling (primary gradient, calm secondary, sober danger).
 */
export function Button({
  label,
  onPress,
  variant = "primary",
  size = "lg",
  loading = false,
  loadingLabel,
  disabled = false,
  fullWidth = true,
  style,
  testID,
  leftSlot,
}: ButtonProps) {
  return (
    <PremiumActionButton
      label={label}
      onPress={onPress}
      variant={VARIANT_MAP[variant]}
      size={size as PremiumButtonSize}
      shape="rounded"
      loading={loading}
      loadingLabel={loadingLabel}
      disabled={disabled}
      fullWidth={fullWidth}
      style={style}
      testID={testID}
      leftSlot={leftSlot}
    />
  );
}
