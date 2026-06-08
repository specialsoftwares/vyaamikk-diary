import { escapeHtml } from "@/utils/escapeHtml";
import { formatPdfDateTime } from "./pdfDate";
import { PDF_ATTRIBUTION } from "./pdfTheme";

export { PDF_ATTRIBUTION };

export interface PdfShortFooterInput {
  generatedAtMs?: number;
  locale?: string;
  pageNumber?: number;
  pageTotal?: number;
  pageLabel?: string;
  fixed?: boolean;
  showGenerated?: boolean;
}

/** Restrained two-column footer for business PDFs. */
export function pdfShortFooterHtml(input: PdfShortFooterInput = {}): string {
  const {
    generatedAtMs,
    locale = "en-IN",
    pageNumber = 1,
    pageTotal = 1,
    pageLabel = "Page",
    fixed = true,
    showGenerated = Boolean(generatedAtMs),
  } = input;

  const pageLine =
    pageTotal > 1
      ? `${pageLabel} ${pageNumber} of ${pageTotal}`
      : `${pageLabel} ${pageNumber}`;

  const generatedLine =
    showGenerated && generatedAtMs
      ? `<div class="pdf-footer-generated">Generated: ${escapeHtml(formatPdfDateTime(generatedAtMs, locale))}</div>`
      : "";

  const cls = fixed ? "pdf-page-fixed-footer" : "pdf-footer";

  return `<div class="${cls}">
    <div class="pdf-footer-row">
      <div class="pdf-footer-left">${escapeHtml(PDF_ATTRIBUTION)}</div>
      <div class="pdf-footer-right">${escapeHtml(pageLine)}</div>
    </div>
    ${generatedLine}
  </div>`;
}

export function pdfFooterCss(): string {
  return `
  .pdf-footer,
  .pdf-page-fixed-footer {
    font-size: 7.5pt;
    color: #9ca3af;
    line-height: 1.35;
  }
  .pdf-footer {
    margin-top: 20pt;
    padding-top: 6pt;
    border-top: 1pt solid #e6e8f0;
  }
  .pdf-page-fixed-footer {
    position: fixed;
    left: 14mm;
    right: 14mm;
    bottom: 8mm;
    width: auto;
    padding: 0;
    z-index: 10;
  }
  .pdf-footer-row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 12pt;
  }
  .pdf-footer-left { text-align: left; flex: 1; }
  .pdf-footer-right { text-align: right; white-space: nowrap; }
  .pdf-footer-generated {
    margin-top: 2pt;
    font-size: 7pt;
    text-align: left;
  }
  `;
}
