import { Platform, type ViewStyle } from "react-native";

import { luxuryCardBorder, luxuryCardShadow, luxuryPrimaryGradient } from "@/theme/luxuryTokens";
import type { ColorScheme } from "@/theme/palettes";

/** Corporate indigo gradient stops — primary CTAs only (vertical depth). */
export function primaryGradientStops(isDark: boolean): readonly [string, string] {
  return luxuryPrimaryGradient(isDark);
}

export function primaryGlossStops(isDark: boolean): readonly [string, string, string] {
  return isDark
    ? (["rgba(255,255,255,0.2)", "rgba(255,255,255,0.04)", "transparent"] as const)
    : (["rgba(255,255,255,0.38)", "rgba(255,255,255,0.1)", "transparent"] as const);
}

export function successGradientStops(isDark: boolean): readonly [string, string] {
  return isDark
    ? (["#0A7A4E", "#12A066"] as const)
    : (["#0C7B50", "#0F8F5A"] as const);
}

export function premiumBorderColor(isDark: boolean, accent: "primary" | "neutral"): string {
  if (accent === "neutral") {
    return luxuryCardBorder(isDark);
  }
  return isDark ? "rgba(255, 255, 255, 0.14)" : "rgba(255, 255, 255, 0.28)";
}

export function premiumElevation(
  isDark: boolean,
  _colors: ColorScheme,
  level: "soft" | "none" = "soft"
): ViewStyle {
  if (level === "none") return {};
  return luxuryCardShadow(isDark);
}
