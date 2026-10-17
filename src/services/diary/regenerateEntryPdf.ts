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
import { buildPdfFileNameForBusinessEntry } from "@/services/pdf/pdfFileNames";
import { dayKey } from "@/utils/date";

import { prepareReceiptPhoto } from "@/services/attachments/prepareReceiptPhoto";
import { documentRevisionForCashEntry } from "@/services/attachments/cashVoucherRevision";
import { beginPdfRender, endPdfRender, markPdfRevisionReady } from "@/services/pdf/pdfRevisionGate";

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
    allowWithoutPhoto?: boolean;
  }
): Promise<BusinessEntry> {
  if (!beginPdfRender(entry.id)) {
    return entry;
  }
  try {
  const uiLang = options.uiLang ?? "en";
  const branding = await getUserPdfBranding(options.user, { t: options.t });
  let extraCss = "";
  if (uiLang === "gu") {
    const fontFace = await gujaratiPdfFontFaceCss();
    extraCss = `${fontFace}${gujaratiPdfBodyFontCss()}`;
  }
  const receiptPhoto =
    entry.entryType === "business_cash_given"
      ? await prepareReceiptPhoto({ uid: userId, entry })
      : null;
  const html = buildBusinessEntryPdfHtml({
    entry,
    user: options.user,
    branding,
    labels: businessEntryPdfLabels(options.t, branding.legal, uiLang),
    extraCss,
    receiptPhoto,
    allowCashPhotoOmission: options.allowWithoutPhoto === true,
  });
  const pdf = await pdfService.generate({
    html,
    fileNameHint: options.fileNameHint.replace("{{date}}", dayKey(entry.entryDate)),
    fileName: buildPdfFileNameForBusinessEntry(entry, {
      businessName: options.user.businessName,
      date: dayKey(entry.entryDate),
    }),
  });
  const saved = await getDiaryRepository().update(userId, { id: entry.id, pdfUri: pdf.uri });
  if (entry.entryType === "business_cash_given" && options.allowWithoutPhoto !== true) {
    markPdfRevisionReady(entry.id, documentRevisionForCashEntry(entry));
  }
  return saved;
  } finally {
    endPdfRender(entry.id);
  }
}
