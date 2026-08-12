import React, { useMemo } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  View,
  type GestureResponderEvent,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";

import {
  ACTION_PRESS_SCALE,
  resolveActionInteraction,
  resolveActionLoadingLabel,
  resolvePrimaryLoadingChrome,
  shouldRetainLoadingContext,
  type ActionPurpose,
  type ActionVisualFamily,
} from "@/actionSystem";
import { LocaleUiText } from "@/components/ui/LocaleUiText";
import {
  premiumBorderColor,
  premiumElevation,
  primaryGlossStops,
  primaryGradientStops,
  successGradientStops,
} from "@/components/ui/premiumTokens";
import { glassFallbackMuted } from "@/theme/glass";
import { radius, spacing, typography, useTheme, useThemedStyles } from "@/theme";

export type PremiumButtonVariant =
  | "primary"
  | "secondary"
  | "glass"
  | "success"
  | "danger"
  | "ghost";

export type PremiumButtonSize = "md" | "lg";
export type PremiumButtonShape = "rounded" | "pill";

export interface PremiumActionButtonProps {
  label: string;
  onPress?: (e: GestureResponderEvent) => void;
  variant?: PremiumButtonVariant;
  size?: PremiumButtonSize;
  shape?: PremiumButtonShape;
  loading?: boolean;
  /** When set with loading, spinner + label retain context and primary keeps active chrome. */
  loadingLabel?: string;
  disabled?: boolean;
  fullWidth?: boolean;
  /** Slightly tighter horizontal padding — same height as `size`. */
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  leftSlot?: React.ReactNode;
  accessibilityLabel?: string;
  /** Optional Stage 1 semantic metadata — does not change visuals by itself. */
  purpose?: ActionPurpose;
  visual?: ActionVisualFamily;
}

const SIZE_LG = { paddingVertical: 14, paddingHorizontal: spacing.xl, minHeight: 52 };
const SIZE_MD = { paddingVertical: 10, paddingHorizontal: spacing.lg, minHeight: 44 };
const SIZE_LG_COMPACT = { ...SIZE_LG, paddingHorizontal: spacing.lg };
const SIZE_MD_COMPACT = { ...SIZE_MD, paddingHorizontal: spacing.md };

export function PremiumActionButton({
  label,
  onPress,
  variant = "primary",
  size = "lg",
  shape = "rounded",
  loading = false,
  loadingLabel,
  disabled = false,
  fullWidth = true,
  compact = false,
  style,
  testID,
  leftSlot,
  accessibilityLabel,
  purpose: _purpose,
  visual: _visual,
}: PremiumActionButtonProps) {
  const { resolvedMode, colors } = useTheme();
  const isDark = resolvedMode === "dark";
  const interaction = resolveActionInteraction({ disabled, loading });
  const retainLoadingContext = shouldRetainLoadingContext({ loading, loadingLabel });
  const retainActiveChrome = retainLoadingContext;
  const chrome = resolvePrimaryLoadingChrome({
    disabled,
    loading,
    retainActiveChrome,
  });
  const visuallyMuted = chrome === "muted";
  const displayLabel = resolveActionLoadingLabel({ label, loading, loadingLabel });
  const corner = shape === "pill" ? radius.pill : radius.lg;
  const sizing =
    size === "lg"
      ? compact
        ? SIZE_LG_COMPACT
        : SIZE_LG
      : compact
        ? SIZE_MD_COMPACT
        : SIZE_MD;

  const palette = useMemo(() => {
    if (visuallyMuted) {
      return {
        fg: colors.textSubtle,
        useGradient: false,
        bg: colors.surfaceMuted,
        border: colors.divider,
        gloss: false,
        elevation: "none" as const,
      };
    }
    switch (variant) {
      case "secondary":
        return {
          fg: colors.primary,
          useGradient: false,
          bg: colors.primaryLight,
          border: isDark ? colors.divider : "transparent",
          gloss: false,
          elevation: "none" as const,
        };
      case "glass":
        return {
          fg: colors.text,
          useGradient: false,
          bg: glassFallbackMuted(resolvedMode),
          border: premiumBorderColor(isDark, "neutral"),
          gloss: false,
          elevation: "none" as const,
        };
      case "success":
        return {
          fg: "#FFFFFF",
          useGradient: true,
          gradient: successGradientStops(isDark),
          border: premiumBorderColor(isDark, "primary"),
          gloss: true,
          elevation: "soft" as const,
        };
      case "danger":
        return {
          fg: "#FFFFFF",
          useGradient: false,
          bg: colors.danger,
          border: "transparent",
          gloss: false,
          elevation: "none" as const,
        };
      case "ghost":
        return {
          fg: colors.primary,
          useGradient: false,
          bg: "transparent",
          border: "transparent",
          gloss: false,
          elevation: "none" as const,
        };
      case "primary":
      default:
        return {
          fg: colors.primaryOn,
          useGradient: true,
          gradient: primaryGradientStops(isDark),
          border: premiumBorderColor(isDark, "primary"),
          gloss: true,
          elevation: "soft" as const,
        };
    }
  }, [variant, visuallyMuted, colors, isDark, resolvedMode]);

  const styles = useThemedStyles(() =>
    StyleSheet.create({
      pressable: {
        borderRadius: corner,
        alignSelf: fullWidth ? ("stretch" as const) : undefined,
      },
      shell: {
        borderRadius: corner,
        overflow: "hidden",
        borderWidth: variant === "ghost" ? 0 : 1,
        borderColor: palette.border,
        ...(palette.elevation === "soft"
          ? premiumElevation(isDark, colors, "soft")
          : {}),
      },
      inner: {
        ...sizing,
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "row",
        gap: spacing.sm,
      },
      flatInner: {
        backgroundColor: palette.bg,
      },
      gloss: {
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        height: "40%",
        borderTopLeftRadius: corner,
        borderTopRightRadius: corner,
      },
      topHighlight: {
        position: "absolute",
        top: 1,
        left: "10%",
        right: "10%",
        height: 1,
        backgroundColor: isDark ? "rgba(255, 255, 255, 0.22)" : "rgba(255, 255, 255, 0.45)",
        borderRadius: 1,
      },
      label: {
        ...typography.bodyStrong,
        color: palette.fg,
        letterSpacing: variant === "primary" ? 0.15 : 0,
        ...(variant === "primary" && !visuallyMuted
          ? {
              textShadowColor: isDark ? "rgba(0,0,0,0.3)" : "rgba(42,47,154,0.2)",
              textShadowOffset: { width: 0, height: 1 },
              textShadowRadius: 2,
            }
          : {}),
      },
      slot: { marginRight: spacing.xs },
    })
  );

  const glossColors = primaryGlossStops(isDark);

  const content = (
    <>
      {palette.gloss && palette.useGradient ? (
        <>
          <LinearGradient
            colors={[...glossColors]}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={styles.gloss}
            pointerEvents="none"
          />
          <View style={styles.topHighlight} pointerEvents="none" />
        </>
      ) : null}
      {loading ? (
        <>
          <ActivityIndicator color={palette.fg} />
          {retainLoadingContext ? (
            <LocaleUiText style={styles.label} maxFontSizeMultiplier={1.25}>
              {displayLabel}
            </LocaleUiText>
          ) : null}
        </>
      ) : (
        <>
          {leftSlot ? <View style={styles.slot}>{leftSlot}</View> : null}
          <LocaleUiText style={styles.label} maxFontSizeMultiplier={1.25}>
            {label}
          </LocaleUiText>
        </>
      )}
    </>
  );

  const gradientColors = palette.useGradient
    ? (palette.gradient as readonly [string, string, ...string[]])
    : null;

  const inner = gradientColors && !visuallyMuted ? (
    <LinearGradient
      colors={gradientColors}
      start={{ x: 0.5, y: 0 }}
      end={{ x: 0.5, y: 1 }}
      style={styles.inner}
    >
      {content}
    </LinearGradient>
  ) : (
    <View style={[styles.inner, styles.flatInner]}>{content}</View>
  );

  return (
    <Pressable
      testID={testID}
      accessibilityRole={interaction.accessibilityRole}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={interaction.accessibilityState}
      onPress={interaction.pressable ? onPress : undefined}
      android_ripple={
        !interaction.pressable || variant === "ghost"
          ? undefined
          : { color: colors.primaryLight }
      }
      style={({ pressed }) => [
        styles.pressable,
        style,
        pressed && interaction.pressable && { transform: [{ scale: ACTION_PRESS_SCALE }] },
      ]}
    >
      <View style={styles.shell}>{inner}</View>
    </Pressable>
  );
}
