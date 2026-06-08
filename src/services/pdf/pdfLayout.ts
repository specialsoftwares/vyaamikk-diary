/**
 * Shared PDF layout — issuer block + short restrained footer.
 */

import type { UserPdfBranding } from "./userPdfBranding";
import { pdfIssuerBlock } from "./pdfComponents";
import { pdfFooterCss, pdfShortFooterHtml, PDF_ATTRIBUTION, type PdfShortFooterInput } from "./pdfFooter";
import { formatPdfDateTime } from "./pdfDate";

export { PDF_ATTRIBUTION };
export { formatPdfDateTime as formatPdfGeneratedAt };

export interface PdfFooterInput extends PdfShortFooterInput {
  userName?: string;
  ueid?: string;
  /** @deprecated Ignored — short footer no longer embeds user/UEID. */
  supplementaryLine?: string | null;
}

/** @deprecated Returns short attribution line only. */
export function buildPdfFooterLine(_input?: {
  userName?: string;
  ueid?: string;
  generatedAtMs?: number;
  locale?: string;
}): string {
  return PDF_ATTRIBUTION;
}

/** Unified short footer for business PDFs. */
export function pdfFooterHtml(input: PdfFooterInput): string {
  return pdfShortFooterHtml({
    generatedAtMs: input.generatedAtMs,
    locale: input.locale,
    pageNumber: input.pageNumber,
    pageTotal: input.pageTotal,
    pageLabel: input.pageLabel,
    fixed: input.fixed ?? true,
    showGenerated: Boolean(input.generatedAtMs),
  });
}

export interface PdfUserProfileLabels {
  title?: string;
  userName?: string;
  business?: string;
  ueid?: string;
}

export const PDF_USER_PROFILE_TITLE = "Business identity";

/** @deprecated Use pdfIssuerBlock from pdfComponents.ts */
export function pdfUserProfileHeaderHtml(
  branding: UserPdfBranding,
  labels?: PdfUserProfileLabels
): string {
  return pdfIssuerBlock({
    branding,
    issuerLabel: labels?.title ?? PDF_USER_PROFILE_TITLE,
    showUeid: false,
  });
}

export function pdfLayoutCss(): string {
  return pdfFooterCss();
}
