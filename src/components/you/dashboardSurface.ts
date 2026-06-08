import { Platform, type ViewStyle } from "react-native";

import { executiveCardDepth } from "@/theme/cardDepth";
import type { ColorScheme } from "@/theme/palettes";

/** Raised dashboard preview rows — Level 3 executive depth. */
export function dashboardRaisedSurface(
  isDark: boolean,
  colors: ColorScheme,
  _accent: "neutral" | "primary" = "neutral"
): ViewStyle {
  return {
    ...executiveCardDepth(isDark, colors, 3),
    ...Platform.select({
      android: { elevation: 2 },
      default: {},
    }),
  };
}
