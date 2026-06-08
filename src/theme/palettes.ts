/**
 * Vyaamikk Diary color palettes — light + dark.
 *
 * Direction:
 *   • Light → white surfaces, deep indigo accent. Premium, restrained.
 *   • Dark  → very dark navy surfaces, brightened indigo accent for
 *             contrast. Should feel native on both iOS (where the system
 *             prefers true dark) and Android (Material 3 dark surfaces).
 *
 * Both palettes share the same key set so every component can read
 * `colors.x` regardless of mode.
 */

export interface ColorScheme {
  background: string;
  surface: string;
  surfaceMuted: string;
  surfaceElevated: string;
  divider: string;
  primary: string;
  primaryDark: string;
  primaryLight: string;
  primaryOn: string;
  text: string;
  textMuted: string;
  textSubtle: string;
  textOnPrimary: string;
  success: string;
  warning: string;
  danger: string;
  dangerSoft: string;
  info: string;
  shadow: string;
  overlay: string;
}

export const lightColors: ColorScheme = {
  background: "#F8F8FA",
  surface: "#FFFFFF",
  surfaceMuted: "#F3F2F8",
  surfaceElevated: "#FFFFFF",
  divider: "#E8E6F0",

  primary: "#4F46E5",
  primaryDark: "#3730A3",
  primaryLight: "#EEF0FF",
  primaryOn: "#FFFFFF",

  text: "#0F1226",
  textMuted: "#4A4D66",
  textSubtle: "#7A7D96",
  textOnPrimary: "#FFFFFF",

  success: "#0F8F5A",
  warning: "#B7791F",
  danger: "#C53030",
  dangerSoft: "#FDECEC",
  info: "#2563EB",

  shadow: "rgba(49, 46, 129, 0.07)",
  overlay: "rgba(15, 18, 38, 0.45)",
};

export const darkColors: ColorScheme = {
  background: "#070810",
  surface: "#12152A",
  surfaceMuted: "#1A1E38",
  surfaceElevated: "#1E2444",
  divider: "#2E3352",

  primary: "#8B91FF",
  primaryDark: "#6B71E3",
  primaryLight: "#252A52",
  primaryOn: "#FFFFFF",

  text: "#F2F3F8",
  textMuted: "#A6AAC4",
  textSubtle: "#6F7393",
  textOnPrimary: "#FFFFFF",

  success: "#34D399",
  warning: "#F59E0B",
  danger: "#F87171",
  dangerSoft: "#3A1A1A",
  info: "#60A5FA",

  shadow: "rgba(0, 0, 0, 0.45)",
  overlay: "rgba(0, 0, 0, 0.6)",
};

export type ColorToken = keyof ColorScheme;
