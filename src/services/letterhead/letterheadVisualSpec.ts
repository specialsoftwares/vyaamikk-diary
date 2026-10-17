/**
 * Single geometry / appearance specification for letterhead previews + PDF.
 *
 * Imported page images: contain + top-centre (never stretch; never vertical-centre
 * crop that hides headers/footers).
 * Generated headers: row / column / row-reverse matching PDF CSS.
 *
 * Appearance: only choices with a real transform are offered in UI.
 * - original / color → no filter (colour preserved)
 * - grayscale → CSS/PDF `grayscale(1)`
 * - mono → CSS/PDF `grayscale(1) contrast(3)` (high-contrast B&W approximation;
 *   not a sensor-threshold bitmap)
 * RN Image cannot apply those CSS filters without a native manipulator; UI
 * that cannot transform pixels must not fake grayscale via opacity.
 */

import type { LetterheadAppearance, LetterheadLogoAlign } from "./letterheadGeneratedLayout";

/** A4 portrait aspect for frames. */
export const LETTERHEAD_A4_ASPECT = 210 / 297;

/** Shared object-fit / resizeMode for imported templates. */
export const IMPORTED_PAGE_FIT = "contain" as const;
/** Shared object-position / alignment for imported templates. */
export const IMPORTED_PAGE_POSITION = "top center" as const;

/** Appearances with a defined PDF/CSS transform. */
export const SUPPORTED_APPEARANCES: LetterheadAppearance[] = [
  "original",
  "color",
  "grayscale",
  "mono",
];

/**
 * Appearances the RN native Image preview can honestly show today
 * (no pixel transform). Grayscale/mono remain selectable for generated
 * templates because PDF HTML applies real CSS filters at export.
 */
export const RN_PREVIEW_SAFE_APPEARANCES: LetterheadAppearance[] = ["original", "color"];

export function appearanceCssFilterClass(
  appearance: LetterheadAppearance | null | undefined
): "" | "grayscale" | "mono" {
  if (appearance === "mono") return "mono";
  if (appearance === "grayscale") return "grayscale";
  return "";
}

/** PDF/CSS filter strings (source of truth for export). */
export const APPEARANCE_CSS_FILTER: Record<LetterheadAppearance, string> = {
  original: "none",
  color: "none",
  grayscale: "grayscale(1)",
  mono: "grayscale(1) contrast(3)",
};

export type GeneratedHeaderFlex = {
  flexDirection: "row" | "column" | "row-reverse";
  justifyContent: "flex-start" | "center" | "flex-end";
  alignItems: "flex-start" | "center" | "flex-end";
  textAlign: "left" | "center" | "right";
};

export function generatedHeaderFlex(align: LetterheadLogoAlign): GeneratedHeaderFlex {
  if (align === "center") {
    return {
      flexDirection: "column",
      justifyContent: "center",
      alignItems: "center",
      textAlign: "center",
    };
  }
  if (align === "right") {
    // row-reverse: main-start is on the right → flex-start packs to the right.
    return {
      flexDirection: "row-reverse",
      justifyContent: "flex-start",
      alignItems: "flex-start",
      textAlign: "right",
    };
  }
  return {
    flexDirection: "row",
    justifyContent: "flex-start",
    alignItems: "flex-start",
    textAlign: "left",
  };
}

export function pdfAlignClass(align: LetterheadLogoAlign): string {
  if (align === "center") return "align-center";
  if (align === "right") return "align-right";
  return "align-left";
}
