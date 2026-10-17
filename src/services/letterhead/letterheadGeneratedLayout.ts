/**
 * Shared model for profile-logo–generated letterheads.
 * Selected fields are snapshotted at save — editing the live profile later
 * does not rewrite previously saved templates or finalized letter PDFs.
 */

export type LetterheadLogoAlign = "left" | "center" | "right";
export type LetterheadAppearance =
  | "original"
  | "color"
  | "grayscale"
  | "mono";

export type LetterheadSourceType = "imported_image" | "generated_layout";

export interface LetterheadGeneratedLayout {
  version: 1;
  logoAlign: LetterheadLogoAlign;
  appearance: LetterheadAppearance;
  /** Snapshotted display strings (never invent missing details). */
  businessName: string | null;
  address: string | null;
  contact: string | null;
  gstin: string | null;
  /**
   * Small logo data URI or local file URI used only for this template.
   * Null → text-only header.
   */
  logoUri: string | null;
}

export const DEFAULT_GENERATED_LAYOUT: Omit<LetterheadGeneratedLayout, "businessName" | "address" | "contact" | "gstin" | "logoUri"> = {
  version: 1,
  logoAlign: "left",
  appearance: "original",
};

export function isLetterheadGeneratedLayout(value: unknown): value is LetterheadGeneratedLayout {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  if (v.version !== 1) return false;
  if (v.logoAlign !== "left" && v.logoAlign !== "center" && v.logoAlign !== "right") {
    return false;
  }
  if (
    v.appearance !== "original" &&
    v.appearance !== "color" &&
    v.appearance !== "grayscale" &&
    v.appearance !== "mono"
  ) {
    return false;
  }
  return true;
}

/** Validate writable bounds cannot collapse the writing area. */
export function validateWritingMargins(margins: {
  topPct: number;
  bottomPct: number;
  leftPct: number;
  rightPct: number;
}): { ok: true } | { ok: false; reason: "collapsed" | "out_of_range" } {
  const vals = [margins.topPct, margins.bottomPct, margins.leftPct, margins.rightPct];
  if (vals.some((n) => !Number.isFinite(n) || n < 0 || n > 80)) {
    return { ok: false, reason: "out_of_range" };
  }
  if (margins.topPct + margins.bottomPct > 80) return { ok: false, reason: "collapsed" };
  if (margins.leftPct + margins.rightPct > 80) return { ok: false, reason: "collapsed" };
  return { ok: true };
}
