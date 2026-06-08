import type { BusinessEntry } from "@/domain/businessEntry";
import type { UserProfile } from "@/domain/types";
import type { Lang } from "@/i18n/types";
import { gujaratiPdfBodyFontCss, gujaratiPdfFontFaceCss } from "@/services/pdf/pdfGujaratiFont";
import {
  buildBusinessEntryPdfHtml,
  businessEntryPdfLabels,
} from "@/services/pdf/businessEntryPdfTemplate";
import { getUserPdfBranding } from "@/services/pdf/userPdfBranding";
import { pdfService } from "@/services/pdf/pdfService";
import { dayKey } from "@/utils/date";

import { getDiaryRepository } from "./index";

export async function regenerateEntryPdf(
  userId: string,
  entry: BusinessEntry,
  options: {
    user: UserProfile;
    /** @deprecated Data formatting is always en-IN. */
    locale?: "en-IN" | "hi-IN";
    uiLang?: Lang;
    t: (key: string, vars?: Record<string, string | number>) => string;
    fileNameHint: string;
  }
): Promise<BusinessEntry> {
  const uiLang = options.uiLang ?? "en";
  const branding = await getUserPdfBranding(options.user, { t: options.t });
  let extraCss = "";
  if (uiLang === "gu") {
    const fontFace = await gujaratiPdfFontFaceCss();
    extraCss = `${fontFace}${gujaratiPdfBodyFontCss()}`;
  }
  const html = buildBusinessEntryPdfHtml({
    entry,
    user: options.user,
    branding,
    labels: businessEntryPdfLabels(options.t, branding.legal, uiLang),
    extraCss,
  });
  const pdf = await pdfService.generate({
    html,
    fileNameHint: options.fileNameHint.replace("{{date}}", dayKey(entry.entryDate)),
  });
  return getDiaryRepository().update(userId, { id: entry.id, pdfUri: pdf.uri });
}
