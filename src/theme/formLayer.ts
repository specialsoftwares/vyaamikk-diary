/**
 * Indigo form / data-entry layer — readable surfaces with executive identity.
 * Forms stay light (surface + ivory hints); indigo appears in focus, headers, chips.
 */

import { Platform, StyleSheet, type TextStyle, type ViewStyle } from "react-native";

import type { ColorScheme } from "./palettes";
import { luxuryCardBorder, luxuryCardShadow } from "./luxuryTokens";
import { radius, spacing } from "./spacing";
import { typography } from "./typography";

/** Uppercase section label on forms and pickers. */
export function formSectionTitleStyle(colors: ColorScheme): TextStyle {
  return {
    ...typography.captionStrong,
    color: colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.55,
    fontWeight: "700",
  };
}

/** Standard field label on data-entry screens. */
export function formFieldLabelStyle(colors: ColorScheme): TextStyle {
  return {
    ...typography.captionStrong,
    color: colors.textMuted,
    marginBottom: spacing.xs + 2,
    fontWeight: "700",
  };
}

/** Tappable date / picker row — matches TextField shell height. */
export function formDateRowStyle(isDark: boolean, colors: ColorScheme): ViewStyle {
  return {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderWidth: 1,
    borderColor: luxuryCardBorder(isDark),
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md + 2,
    paddingVertical: spacing.sm + 4,
    backgroundColor: colors.surface,
    minHeight: 52,
  };
}

/** Nested line-item / sub-form card inside a section. */
export function formNestedCardStyle(isDark: boolean, colors: ColorScheme): ViewStyle {
  return {
    borderWidth: 1,
    borderColor: luxuryCardBorder(isDark),
    borderRadius: radius.lg,
    padding: spacing.md + 2,
    gap: spacing.sm,
    backgroundColor: colors.surface,
    marginBottom: spacing.sm,
    ...luxuryCardShadow(isDark),
  };
}

/** Readable form surface — not dark; subtle indigo edge. */
export function formSurfaceStyle(isDark: boolean, colors: ColorScheme): ViewStyle {
  return {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: luxuryCardBorder(isDark),
    padding: spacing.lg + 2,
    gap: spacing.lg + 2,
    ...luxuryCardShadow(isDark),
  };
}

/** Input row focus — high contrast, indigo ring. */
export function formInputFocusedStyle(colors: ColorScheme): ViewStyle {
  return {
    borderColor: colors.primaryDark,
    borderWidth: 1.5,
    backgroundColor: colors.surface,
    ...Platform.select({
      ios: {
        shadowColor: colors.primaryDark,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.14,
        shadowRadius: 8,
      },
      android: { elevation: 1 },
      default: {},
    }),
  };
}

/** Composer / picker bottom sheet top edge. */
export function composerSheetBorder(isDark: boolean): ViewStyle {
  return {
    borderTopWidth: 2,
    borderTopColor: isDark ? "rgba(139, 145, 255, 0.35)" : "rgba(79, 70, 229, 0.2)",
  };
}

/** Executive header back control — indigo tint. */
export function executiveHeaderBackStyle(colors: ColorScheme): ViewStyle {
  return {
    backgroundColor: colors.primaryLight,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.primary,
  };
}
