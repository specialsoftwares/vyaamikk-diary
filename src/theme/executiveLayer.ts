/**
 * Vyaamikk Executive Experience Layer — final premium pass tokens.
 * Builds on Signature Layer; decorative surfaces only.
 */

import { Platform, StyleSheet, type ViewStyle } from "react-native";

import type { ResolvedThemeMode } from "./ThemeContext";
import type { ColorScheme } from "./palettes";
import { spacing } from "./spacing";

/** Section header vertical rhythm (standalone screens). */
export const EXECUTIVE_SECTION_GAP = {
  before: 24,
  after: 10,
  titleSubtitle: 4,
} as const;

/** You dashboard — uniform gaps between all major blocks. */
export const DASHBOARD_SECTION_GAP = spacing.lg;
export const DASHBOARD_TOP_CLUSTER_GAP = spacing.md;
export const DASHBOARD_HEADLINE_BOTTOM = spacing.sm;

/** Search bar presence — subtle brand glow, not neon */
export function executiveSearchBorder(isDark: boolean): string {
  return isDark ? "rgba(139, 145, 255, 0.28)" : "rgba(79, 70, 229, 0.14)";
}

export function executiveSearchGlow(isDark: boolean): ViewStyle {
  return {
    borderWidth: 1,
    borderColor: executiveSearchBorder(isDark),
    ...Platform.select({
      ios: {
        shadowColor: isDark ? "#8B91FF" : "#4F46E5",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: isDark ? 0.18 : 0.08,
        shadowRadius: 10,
      },
      android: { elevation: 2 },
      default: {},
    }),
  };
}

/** Safe press feedback for hero/stat/preview cards — no layout jump. */
export function executivePressFeedback(pressed: boolean): ViewStyle {
  return {
    opacity: pressed ? 0.94 : 1,
    transform: [{ scale: pressed ? 0.97 : 1 }],
  };
}

/** One-shot fade duration for success surfaces (ms). */
export const EXECUTIVE_SUCCESS_FADE_MS = 280;

/** Dashboard greeting hero — richer contrast vs page background (You tab only). */
export function dashboardGreetingGradient(
  mode: ResolvedThemeMode
): readonly [string, string, ...string[]] {
  if (mode === "dark") {
    return ["#2A3158", "#1E2444", "#161B34"] as const;
  }
  return ["#F6F3FF", "#EBE6F8", "#DDD6F0"] as const;
}

/** Elevated shell for the You dashboard greeting card. */
export function dashboardGreetingDepth(isDark: boolean, colors: ColorScheme): ViewStyle {
  if (isDark) {
    return {
      borderRadius: 20,
      borderWidth: 1,
      borderColor: "rgba(139, 145, 255, 0.24)",
      backgroundColor: "#1E2444",
      ...Platform.select({
        ios: {
          shadowColor: "#000000",
          shadowOffset: { width: 0, height: 10 },
          shadowOpacity: 0.42,
          shadowRadius: 22,
        },
        android: { elevation: 7 },
        default: {},
      }),
    };
  }
  return {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(79, 70, 229, 0.16)",
    backgroundColor: "#F0EBFA",
    ...Platform.select({
      ios: {
        shadowColor: colors.primaryDark,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.16,
        shadowRadius: 18,
      },
      android: { elevation: 5 },
      default: {},
    }),
  };
}

/** Deeper executive hero gradients (Signature Layer + depth). */
export function executiveHeroGradient(
  mode: ResolvedThemeMode,
  variant: "dashboard" | "statutory" | "identity" | "success" = "dashboard"
): readonly [string, string, ...string[]] {
  if (mode === "dark") {
    switch (variant) {
      case "statutory":
        return ["#1C2648", "#141830", "#090B14"] as const;
      case "identity":
        return ["#1A1F3D", "#12152A", "#090B14"] as const;
      case "success":
        return ["#1A2240", "#12152A", "#090B14"] as const;
      default:
        return ["#1C2040", "#141830", "#090B14"] as const;
    }
  }
  switch (variant) {
    case "statutory":
      return ["#ECEFF5", "#F6F5FA", "#FAFAF8"] as const;
    case "identity":
      return ["#F0EDF8", "#F8F7FC", "#FDFDFB"] as const;
    case "success":
      return ["#ECEEFF", "#F5F4FA", "#FAFAF8"] as const;
    default:
      return ["#EEEEF8", "#F7F6FC", "#FDFDFB"] as const;
  }
}
