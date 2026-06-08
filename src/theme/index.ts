/**
 * Theme barrel.
 *
 * `colors` is kept as a re-export of the LIGHT palette so non-React code
 * (utilities, PDF templates) can reach for static hex values. Inside
 * React components, always use `useThemedStyles` / `useThemeColors`
 * instead so dark mode propagates correctly.
 */

export { lightColors as colors } from "./palettes";
export { lightColors, darkColors } from "./palettes";
export type { ColorScheme, ColorToken } from "./palettes";
export { spacing, radius } from "./spacing";
export {
  glassBlurIntensity,
  glassCardTint,
  glassChromeTint,
  glassFallbackFill,
  glassFallbackMuted,
  glassTabBarIntensity,
  useNativeGlassBlur,
} from "./glass";
export { typography } from "./typography";
export {
  ThemeProvider,
  useTheme,
  useAppTheme,
  useThemeColors,
  useThemedStyles,
  APPEARANCE_STORAGE_KEY,
  type ThemeMode,
  type ResolvedThemeMode,
} from "./ThemeContext";
export {
  getCategoryAccent,
  getCategoryAccents,
  type CategoryAccentKey,
  type CategoryAccentSet,
} from "./categoryAccents";
export {
  accentKeyForEntryType,
  accentKeyForComposerPickerKey,
  accentKeyForCalendarCategory,
  accentKeyForSearchCategory,
  calendarMarkerDotColors,
  mapMarkerColorForEntryType,
  accentKeyFromTypeLabelKey,
} from "./categoryAccentResolver";
export { buildBrandTokens, type BrandTokens } from "./brandTokens";
export { useBrandTokens, useCategoryAccent } from "./useBrandTokens";
export {
  signatureHeroGradient,
  signaturePressOpacity,
  SIGNATURE_PATTERN_OPACITY,
  type SignatureHeroVariant,
} from "./signatureLayer";
export {
  executiveHeroGradient,
  executiveSearchGlow,
  executiveSearchBorder,
  executivePressFeedback,
  EXECUTIVE_SECTION_GAP,
  EXECUTIVE_SUCCESS_FADE_MS,
  DASHBOARD_SECTION_GAP,
  DASHBOARD_TOP_CLUSTER_GAP,
  DASHBOARD_HEADLINE_BOTTOM,
} from "./executiveLayer";
export { executiveCardDepth, type CardDepthLevel } from "./cardDepth";
export {
  LUXURY_COLORS,
  LUXURY_PRESS,
  luxuryCardBorder,
  luxuryCardShadow,
  luxuryElevatedSurface,
  luxuryHeadingStyle,
  luxuryPlatinumAccent,
  luxuryPrimaryGradient,
  luxurySkeletonTint,
  type LuxurySurfaceLevel,
} from "./luxuryTokens";
export {
  formSectionTitleStyle,
  formFieldLabelStyle,
  formDateRowStyle,
  formNestedCardStyle,
  formSurfaceStyle,
  formInputFocusedStyle,
  composerSheetBorder,
  executiveHeaderBackStyle,
} from "./formLayer";
