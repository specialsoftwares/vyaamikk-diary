/**
 * PDF footer helpers — canonical layout in pdfLayout.ts.
 *
 * LEGAL_REVIEW_TODO: See src/config/brand.ts — counsel review required before launch.
 */

import {
  APP_BRAND_LINE,
  APP_BRAND_NAME,
  LEGAL_OPERATOR,
  LEGAL_OPERATOR_LINE,
  PUBLIC_BRAND,
} from "@/config/brand";

import { buildPdfFooterLine, pdfFooterHtml, type PdfFooterInput } from "./pdfLayout";

export const PDF_LEGAL_FOOTER_COLOR = "#9CA3AF";
export const PDF_LEGAL_FOOTER_FONT_PT = "7.5pt";

/** @deprecated Use PDF_ATTRIBUTION from pdfTheme.ts */
export const PDF_LEGAL_FOOTER_TEXT_EN = "Created using Vyaamikk Diary.";

export interface PdfLegalFooterLabels {
  page: string;
}

export function pdfLegalLabelsFromT(
  t: (key: string, vars?: Record<string, string | number>) => string
): PdfLegalFooterLabels {
  return { page: t("legal.pdfPage") };
}

export function defaultPdfLegalFooterLabels(): PdfLegalFooterLabels {
  return { page: "Page" };
}

export function pdfLegalFooterCss(): string {
  return "";
}

export { formatPdfGeneratedAt } from "./pdfLayout";

/** @deprecated Body metadata removed — returns empty string. */
export function pdfDocumentMetaTableHtml(_input: unknown): string {
  return "";
}

export interface PdfLegalFooterHtmlInput {
  labels: PdfLegalFooterLabels;
  generatedAtMs: number;
  generatedByName?: string | null;
  ueid?: string;
  pageNumber?: number;
  pageTotal?: number;
  locale?: string;
  fixed?: boolean;
  supplementaryLine?: string | null;
}

/** @deprecated Prefer pdfFooterHtml from pdfLayout.ts */
export function pdfLegalFooterHtml(input: PdfLegalFooterHtmlInput): string {
  const footerInput: PdfFooterInput = {
    userName: input.generatedByName ?? "—",
    ueid: input.ueid ?? "—",
    generatedAtMs: input.generatedAtMs,
    locale: input.locale,
    pageNumber: input.pageNumber,
    pageTotal: input.pageTotal,
    fixed: input.fixed,
    pageLabel: input.labels.page,
    supplementaryLine: input.supplementaryLine,
  };
  return pdfFooterHtml(footerInput);
}

export { buildPdfFooterLine, pdfFooterHtml };
export { APP_BRAND_NAME, APP_BRAND_LINE, LEGAL_OPERATOR, LEGAL_OPERATOR_LINE, PUBLIC_BRAND };
