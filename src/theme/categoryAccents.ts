/**
 * Premium Indian Business Palette — category accent tokens.
 *
 * Accents are for chips, badges, icon tints, border strips, dots, and
 * empty-state highlights only — never full-screen backgrounds.
 */

import type { ResolvedThemeMode } from "./ThemeContext";

export type CategoryAccentKey =
  | "payment"
  | "cash"
  | "freight"
  | "material"
  | "staff"
  | "work"
  | "statutory"
  | "letterhead"
  | "proPack"
  | "reminder"
  | "map";

export interface CategoryAccentSet {
  /** Icons, dots, left strips, active borders */
  main: string;
  /** Chip / badge background tint */
  soft: string;
  /** Optional secondary (e.g. saffron on statutory) */
  highlight?: string;
}

const light: Record<CategoryAccentKey, CategoryAccentSet> = {
  payment: { main: "#0D6E5F", soft: "#E6F5F2" },
  cash: { main: "#047857", soft: "#ECFDF5", highlight: "#B8860B" },
  freight: { main: "#C2410C", soft: "#FFF7ED" },
  material: { main: "#9A3412", soft: "#FFF1E8" },
  staff: { main: "#1D4ED8", soft: "#EFF6FF" },
  work: { main: "#3B41C5", soft: "#EEF0FF" },
  statutory: { main: "#1E3A5F", soft: "#EEF2F7", highlight: "#D97706" },
  letterhead: { main: "#6B21A8", soft: "#F3E8FF" },
  proPack: { main: "#4C1D95", soft: "#EDE9FE" },
  reminder: { main: "#B45309", soft: "#FFFBEB" },
  map: { main: "#0F766E", soft: "#CCFBF1" },
};

const dark: Record<CategoryAccentKey, CategoryAccentSet> = {
  payment: { main: "#2DD4BF", soft: "#0D2623" },
  cash: { main: "#34D399", soft: "#0A1F17", highlight: "#FBBF24" },
  freight: { main: "#EA580C", soft: "#2A1508" },
  material: { main: "#E07A3A", soft: "#261408" },
  staff: { main: "#60A5FA", soft: "#0F1A2E" },
  work: { main: "#8B91FF", soft: "#252A52" },
  statutory: { main: "#93C5FD", soft: "#121C2E", highlight: "#F59E0B" },
  letterhead: { main: "#C084FC", soft: "#1E1033" },
  proPack: { main: "#A78BFA", soft: "#1A1433" },
  reminder: { main: "#FBBF24", soft: "#2A1F08" },
  map: { main: "#2DD4BF", soft: "#0A2220" },
};

export function getCategoryAccent(
  key: CategoryAccentKey,
  mode: ResolvedThemeMode
): CategoryAccentSet {
  return mode === "dark" ? dark[key] : light[key];
}

export function getCategoryAccents(mode: ResolvedThemeMode): Record<CategoryAccentKey, CategoryAccentSet> {
  return mode === "dark" ? dark : light;
}
