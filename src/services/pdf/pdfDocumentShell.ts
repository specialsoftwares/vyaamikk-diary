import { PDF_PAGE_CSS } from "./pdfPageStyles";
import { pdfShortFooterHtml, type PdfShortFooterInput } from "./pdfFooter";

export interface BuildPdfDocumentInput {
  locale?: "en-IN" | "hi-IN";
  bodyHtml: string;
  footer?: PdfShortFooterInput;
  extraCss?: string;
}

export function buildPdfHtmlDocument(input: BuildPdfDocumentInput): string {
  const locale = input.locale ?? "en-IN";
  const lang = locale.startsWith("hi") ? "hi" : "en";
  const footerHtml = pdfShortFooterHtml({
    fixed: true,
    showGenerated: false,
    ...input.footer,
  });
  const extraCss = input.extraCss ?? "";

  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<style>${PDF_PAGE_CSS}${extraCss}</style>
</head>
<body>
<div class="pdf-print-document">
  <div class="pdf-print-body"><div class="pdf-doc">${input.bodyHtml}</div></div>
  ${footerHtml}
</div>
</body>
</html>`;
}
