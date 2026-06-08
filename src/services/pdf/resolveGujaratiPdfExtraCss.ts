import type { Lang } from "@/i18n/types";
import { gujaratiPdfBodyFontCss, gujaratiPdfFontFaceCss } from "./pdfGujaratiFont";

/** Injects Noto Sans Gujarati @font-face CSS when UI language is Gujarati. */
export async function resolveGujaratiPdfExtraCss(uiLang?: Lang): Promise<string> {
  if (uiLang !== "gu") return "";
  const fontFace = await gujaratiPdfFontFaceCss();
  if (!fontFace) return "";
  return `${fontFace}${gujaratiPdfBodyFontCss()}`;
}
