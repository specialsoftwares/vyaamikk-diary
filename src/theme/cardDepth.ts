/**
 * Executive card depth hierarchy — consistent surfaces across the app.
 *
 * Level 1: Hero / major command surfaces
 * Level 2: Summary / stat cards
 * Level 3: Record preview rows
 * Level 4: Chips / badges (minimal)
 */

import { Platform, StyleSheet, type ViewStyle } from "react-native";

import { premiumElevation } from "@/components/ui/premiumTokens";
import { luxuryCardBorder, luxuryCardShadow } from "./luxuryTokens";
import type { ColorScheme } from "./palettes";
import { radius, spacing } from "./spacing";

export type CardDepthLevel = 1 | 2 | 3 | 4;

export function executiveCardDepth(
  isDark: boolean,
  colors: ColorScheme,
  level: CardDepthLevel
): ViewStyle {
  switch (level) {
    case 1:
      return {
        backgroundColor: colors.surface,
        borderRadius: radius.xl,
        borderWidth: 1,
        borderColor: luxuryCardBorder(isDark),
        ...luxuryCardShadow(isDark),
        ...Platform.select({
          ios: {
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: isDark ? 0.28 : 0.08,
            shadowRadius: 16,
          },
          android: { elevation: 4 },
          default: {},
        }),
      };
    case 2:
      return {
        backgroundColor: colors.surface,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: luxuryCardBorder(isDark),
        ...premiumElevation(isDark, colors, "soft"),
      };
    case 3:
      return {
        backgroundColor: colors.surface,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: luxuryCardBorder(isDark),
        ...luxuryCardShadow(isDark),
        ...Platform.select({
          android: { elevation: 1 },
          default: {},
        }),
      };
    case 4:
    default:
      return {
        borderRadius: radius.pill,
        paddingVertical: 2,
        paddingHorizontal: spacing.sm,
      };
  }
}
