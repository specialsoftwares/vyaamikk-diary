/**
 * Vyaamikk Diary color palette.
 *
 * Direction: white/light background, deep indigo accent, restrained.
 * Built to feel like a serious business utility, not a social app.
 */

export const colors = {
  // Surfaces — ivory / lilac light; violet-black dark
  background: "#FAFAF8",
  surface: "#FFFFFF",
  surfaceMuted: "#F3F1FA",
  surfaceElevated: "#FFFFFF",
  divider: "#E6E8F0",

  // Brand / accent
  primary: "#3B41C5", // deep indigo
  primaryDark: "#2A2F9A",
  primaryLight: "#EEF0FF",
  primaryOn: "#FFFFFF",

  // Text
  text: "#0F1226",
  textMuted: "#5C5F7A",
  textSubtle: "#8A8DA6",
  textOnPrimary: "#FFFFFF",

  // Status
  success: "#0F8F5A",
  warning: "#B7791F",
  danger: "#C53030",
  dangerSoft: "#FDECEC",
  info: "#2563EB",

  // Misc
  shadow: "rgba(15, 18, 38, 0.08)",
  overlay: "rgba(15, 18, 38, 0.45)",
} as const;

export type ColorToken = keyof typeof colors;
