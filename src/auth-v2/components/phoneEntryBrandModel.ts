/** Phone Entry laser-etched brand signature — copy and visibility only. */

export const PHONE_ENTRY_BRAND_TAGLINE = "CREATE RECORDS. GROW BUSINESS." as const;

export const PHONE_ENTRY_PROVENANCE_LINE_1 =
  "DESIGNED & DEVELOPED BY SPECIAL SOFTWARES" as const;
export const PHONE_ENTRY_PROVENANCE_LINE_2 = "BUILT IN INDIA. BUILT FOR INDIA" as const;

export const PHONE_ENTRY_BRAND_COLORS = {
  indigo: "#1E1B4B",
  periwinkle: "#818CF8",
  gold: "#C9A84C",
  markStroke: "rgba(199,203,255,0.42)",
  markCut: "#171B3D",
  wordmark: "rgba(226,232,255,0.50)",
  diary: "rgba(226,232,255,0.30)",
  rule: "rgba(201,168,76,0.40)",
  tagline: "rgba(226,232,255,0.34)",
  provenancePrimary: "rgba(226,232,255,0.28)",
  provenanceSecondary: "rgba(226,232,255,0.24)",
} as const;

/** Keyboard visible → hide signature entirely. Form/CTA always win. */
export function shouldShowPhoneEntryBrand(input: { keyboardVisible: boolean }): boolean {
  return !input.keyboardVisible;
}

/** Lowest-priority decorative line — hide before the Vyaamikk signature. */
export function shouldShowPhoneEntryProvenance(input: {
  keyboardVisible: boolean;
  windowHeight: number;
}): boolean {
  if (input.keyboardVisible) return false;
  if (input.windowHeight < 640) return false;
  return true;
}
