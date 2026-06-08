/** Shared A4 print CSS — corporate document shell. */

import { pdfFooterCss } from "./pdfFooter";
import { PDF_TABLE_CSS } from "./pdfTable";
import { PDF_THEME_CSS } from "./pdfTheme";

export const PDF_PAGE_CSS = `
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  html, body {
    margin: 0;
    padding: 0;
    background: #ffffff;
    color: #0f1226;
    font-family:
      -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
      "Noto Sans", "Noto Sans Devanagari", "Mangal", sans-serif;
    font-size: 10pt;
    line-height: 1.45;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .pdf-print-document {
    width: 210mm;
    margin: 0 auto;
    position: relative;
  }
  .pdf-print-body {
    padding: 12mm 14mm 0 14mm;
    padding-bottom: 28mm;
    min-height: calc(297mm - 28mm);
  }
  h1, h2 { margin: 0; }
  table.meta {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 8pt;
    table-layout: fixed;
  }
  table.meta th {
    text-align: left;
    width: 34%;
    padding: 3pt 8pt 3pt 0;
    color: #5c5f7a;
    font-weight: 600;
    font-size: 8pt;
    vertical-align: top;
    word-wrap: break-word;
  }
  table.meta td {
    padding: 3pt 0;
    font-size: 8.5pt;
    color: #0f1226;
    vertical-align: top;
    word-wrap: break-word;
    overflow-wrap: anywhere;
  }
  table.meta-compact { margin-bottom: 4pt; }
  table.meta tr { page-break-inside: avoid; }
  .notes {
    white-space: pre-wrap;
    font-size: 9pt;
    line-height: 1.45;
    padding: 8pt 10pt;
    background: #f8f9fc;
    border-radius: 4px;
    border: 1pt solid #e6e8f0;
    word-wrap: break-word;
    overflow-wrap: anywhere;
  }
  .notes-compact { margin-bottom: 4pt; }
  .pdf-document-history {
    margin-bottom: 10pt;
    padding: 6pt 8pt;
    background: #f8f9fc;
    border: 1pt solid #e6e8f0;
    border-radius: 4pt;
    page-break-inside: avoid;
  }
  .pdf-document-history-title {
    font-size: 7.5pt;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5pt;
    color: #5c5f7a;
    margin-bottom: 3pt;
  }
  .pdf-document-history-narrative {
    font-size: 8pt;
    color: #0f1226;
    line-height: 1.4;
    margin: 0;
  }
  ${PDF_THEME_CSS}
  ${PDF_TABLE_CSS}
  ${pdfFooterCss()}
`;

/** Body content + fixed footer. */
export function pdfPrintDocumentWrap(contentHtml: string, footerHtml: string): string {
  return `<div class="pdf-print-document">
  <div class="pdf-print-body"><div class="pdf-doc">${contentHtml}</div></div>
  ${footerHtml}
</div>`;
}

/** @deprecated Use pdfPrintDocumentWrap with footer passed separately. */
export function pdfPageWrap(bodyHtml: string): string {
  return `<div class="page">${bodyHtml}</div>`;
}

/** @deprecated Use pdfPrintDocumentWrap — footer must not sit in the content flow. */
export function pdfFlowDocumentWrap(bodyHtml: string): string {
  return `<div class="pdf-print-body">${bodyHtml}</div>`;
}
