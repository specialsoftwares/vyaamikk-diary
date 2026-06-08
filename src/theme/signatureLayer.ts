/**
 * Vyaamikk Signature Layer — restrained gradient + texture tokens.
 * Decorative only; never applied to forms, PDFs, or long lists.
 */

import type { ResolvedThemeMode } from "./ThemeContext";

export type SignatureHeroVariant = "dashboard" | "statutory" | "identity" | "success";

/** Soft hero gradient stops — violet identity, ivory/dark base. */
export function signatureHeroGradient(
  mode: ResolvedThemeMode,
  variant: SignatureHeroVariant = "dashboard"
): readonly [string, string, ...string[]] {
  if (mode === "dark") {
    switch (variant) {
      case "statutory":
        return ["#1A2240", "#12152A", "#0A0C18"] as const;
      case "identity":
        return ["#1E2240", "#141830", "#0A0C18"] as const;
      case "success":
        return ["#1A2038", "#12152A", "#0A0C18"] as const;
      default:
        return ["#1E2240", "#141830", "#0A0C18"] as const;
    }
  }
  switch (variant) {
    case "statutory":
      return ["#EEF2F7", "#F5F3FA", "#FAFAF8"] as const;
    case "identity":
      return ["#F3F1FA", "#F8F7FC", "#FAFAF8"] as const;
    case "success":
      return ["#EEF0FF", "#F5F3FA", "#FAFAF8"] as const;
    default:
      return ["#F3F1FA", "#F8F7FC", "#FAFAF8"] as const;
  }
}

/** Pattern overlay opacity — keep ≤0.06 for corporate restraint. */
export const SIGNATURE_PATTERN_OPACITY = {
  hero: 0.045,
  empty: 0.05,
  success: 0.06,
  corner: 0.055,
} as const;

/** Gentle press feedback (no layout shift). */
export function signaturePressOpacity(pressed: boolean): number {
  return pressed ? 0.9 : 1;
}
