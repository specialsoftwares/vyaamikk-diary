/**
 * Luxury Indigo elevation tokens — one premium notch above executive layer.
 * Visual-only; consumed by shared surfaces, cards, CTAs, and skeletons.
 */

import { Platform, type TextStyle, type ViewStyle } from "react-native";

import type { ColorScheme } from "./palettes";
import { radius } from "./spacing";

export const LUXURY_COLORS = {
  light: {
    appBackground: "#F8F8FA",
    cardSurface: "#FFFFFF",
    primary: "#4F46E5",
    primaryDeep: "#3730A3",
    richIndigo: "#312E81",
    platinum: "#C9B97A",
    platinumSoft: "#E5E0D0",
    cardBorder: "rgba(99, 102, 241, 0.08)",
    cardShadow: "rgba(49, 46, 129, 0.07)",
  },
  dark: {
    cardBorder: "rgba(139, 145, 255, 0.14)",
    cardHighlight: "rgba(139, 145, 255, 0.22)",
    platinum: "#C9B97A",
    platinumSoft: "rgba(201, 185, 122, 0.18)",
  },
} as const;

/** Tactile press — scale 0.97, ~120ms ease-out via LuxuryPressable. */
export const LUXURY_PRESS = {
  scale: 0.97,
  opacity: 0.94,
  durationMs: 120,
} as const;

export function luxuryCardBorder(isDark: boolean): string {
  return isDark ? LUXURY_COLORS.dark.cardBorder : LUXURY_COLORS.light.cardBorder;
}

/** Spec shadow: 0 2px 12px rgba(49, 46, 129, 0.07) — iOS light mode only.
 * Android Material elevation paints a large rectangular grey plane around
 * rounded cards (visible as slabs in light mode). Android depth is the
 * hairline luxury border on the same surface, not elevation.
 */
export function luxuryCardShadow(isDark: boolean): ViewStyle {
  if (isDark) return {};
  return Platform.select({
    ios: {
      shadowColor: LUXURY_COLORS.light.richIndigo,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.07,
      shadowRadius: 12,
    },
    android: {},
    default: {},
  }) as ViewStyle;
}

export type LuxurySurfaceLevel = 1 | 2 | 3;

/** Layered card surface — border + subtle float (dark leans on border). */
export function luxuryElevatedSurface(
  isDark: boolean,
  colors: ColorScheme,
  level: LuxurySurfaceLevel = 2
): ViewStyle {
  const corner = level === 1 ? radius.xl : radius.lg;
  return {
    backgroundColor: colors.surface,
    borderRadius: corner,
    borderWidth: 1,
    borderColor: luxuryCardBorder(isDark),
    ...luxuryCardShadow(isDark),
  };
}

/** Primary CTA vertical gradient stops. */
export function luxuryPrimaryGradient(isDark: boolean): readonly [string, string] {
  return isDark
    ? (["#5B52E8", "#3730A3"] as const)
    : (["#4F46E5", "#3730A3"] as const);
}

/** Sparingly used — selected chip edge, premium badge accent. */
export function luxuryPlatinumAccent(isDark: boolean): string {
  return isDark ? LUXURY_COLORS.dark.platinum : LUXURY_COLORS.light.platinum;
}

/** Indigo-tinted skeleton base — avoids harsh grey pulse. */
export function luxurySkeletonTint(isDark: boolean, colors: ColorScheme): string {
  return isDark ? "rgba(139, 145, 255, 0.14)" : colors.primaryLight;
}

/** Tighter, authoritative headings. */
export function luxuryHeadingStyle(base: TextStyle): TextStyle {
  const size = base.fontSize ?? 16;
  const letterSpacing = size >= 22 ? -0.4 : size >= 18 ? -0.35 : -0.3;
  const weight =
    base.fontWeight === "600" || base.fontWeight === 600 ? ("700" as const) : base.fontWeight;
  return { ...base, letterSpacing, fontWeight: weight };
}

/** Secondary label opacity target (~82%). */
export const LUXURY_LABEL_OPACITY = 0.82;
