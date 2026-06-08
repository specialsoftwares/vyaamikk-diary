/**
 * Semantic design tokens — brand, surfaces, text.
 * Built from the active ColorScheme; use inside React via `useBrandTokens`.
 */

import { glassFallbackFill, glassFallbackMuted } from "./glass";
import { luxuryPlatinumAccent } from "./luxuryTokens";
import type { ColorScheme } from "./palettes";
import type { ResolvedThemeMode } from "./ThemeContext";
import { getCategoryAccents, type CategoryAccentKey, type CategoryAccentSet } from "./categoryAccents";

export interface BrandTokens {
  brand: {
    primary: string;
    primarySoft: string;
    primaryDark: string;
    /** Sparingly — premium chip edge, selected accent. */
    platinum: string;
  };
  surface: {
    base: string;
    card: string;
    muted: string;
    glass: string;
    glassMuted: string;
  };
  text: {
    primary: string;
    secondary: string;
    subtle: string;
  };
  accent: Record<CategoryAccentKey, CategoryAccentSet>;
}

export function buildBrandTokens(
  colors: ColorScheme,
  mode: ResolvedThemeMode
): BrandTokens {
  return {
    brand: {
      primary: colors.primary,
      primarySoft: colors.primaryLight,
      primaryDark: colors.primaryDark,
      platinum: luxuryPlatinumAccent(mode === "dark"),
    },
    surface: {
      base: colors.background,
      card: colors.surface,
      muted: colors.surfaceMuted,
      glass: glassFallbackFill(mode),
      glassMuted: glassFallbackMuted(mode),
    },
    text: {
      primary: colors.text,
      secondary: colors.textMuted,
      subtle: colors.textSubtle,
    },
    accent: getCategoryAccents(mode),
  };
}
