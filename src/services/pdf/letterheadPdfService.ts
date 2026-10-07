/**
 * Letterhead PDF composition service.
 *
 * Layers the user's saved letterhead template (image) as a full-A4 page
 * background, then flows the letter content inside a print-safe writable
 * area defined by the configured margins.
 *
 * Multi-page strategy
 * -------------------
 *   • The template image is rendered as a `position: fixed` full-page layer.
 *     In paged media (expo-print's WebView) fixed boxes repeat on *every*
 *     printed page, so the uploaded letterhead appears on page 1, 2, 3 … with
 *     zero extra work.
 *   • The writable area is enforced via CSS `@page { margin: <inches> }`,
 *     derived from the stored percentage margins. Because the margin is part
 *     of the page box, body text that overflows page 1 continues on page 2
 *     *inside the same safe area* — it never overlaps the header/footer band.
 *   • `page-break-inside: avoid` on the signature block keeps the closing /
 *     signature together. Paragraphs break between blocks where possible.
 *
 * Branding
 * --------
 * Exported PDFs are clean business letterhead documents only — there is no
 * Vyaamikk footer, branding, UEID, operator text, or platform metadata on the
 * page. Internal app history/metadata stays in the app layer, not in the PDF.
 *
 * Rendering note: expo-print's WebView often ignores CSS `background-image`
 * with inline data URIs, so the background is a real `<img>` element sized to
 * the full page.
 */

import type {
  LetterheadConfig,
  LetterheadDocumentInput,
} from "@/services/letterhead";
import { marginsToInches } from "@/services/letterhead";
import { resolveLetterheadImageSource } from "@/services/letterhead/letterheadImageResolver";

import { assertEnglishOnlyPdf, clearEnglishOnlyPdfContext } from "@/services/pdf/pdfLabels";
import { escapeHtml, escapeHtmlAttr } from "@/utils/escapeHtml";

export interface BuildLetterheadHtmlInput {
  config: LetterheadConfig;
  doc: LetterheadDocumentInput;
  labels: LetterheadPdfLabels;
  locale?: "en-IN" | "hi-IN";
}

export interface LetterheadPdfLabels {
  subject: string;
  date: string;
  reference: string;
  to: string;
}

/** Result of composing a letterhead — HTML plus any soft warnings to surface. */
export interface BuildLetterheadHtmlResult {
  html: string;
  /** i18n keys for non-fatal issues (e.g. a requested asset was missing). */
  warnings: string[];
}

const SIGNATURE_MAX_W = 180; // pt
const SIGNATURE_MAX_H = 70; // pt
const STAMP_MAX_W = 130; // pt
const STAMP_MAX_H = 130; // pt

export async function buildLetterheadHtml(
  input: BuildLetterheadHtmlInput
): Promise<BuildLetterheadHtmlResult> {
  assertEnglishOnlyPdf("letterheadPdfService");
  try {
  const { config, doc, labels, locale = "en-IN" } = input;
  const warnings: string[] = [];

  const isGenerated =
    config.sourceType === "generated_layout" && Boolean(config.generatedLayout);
  const { uri: templateSrc } = isGenerated
    ? { uri: null as string | null }
    : await resolveLetterheadImageSource(config);
  if (!isGenerated && !templateSrc?.trim()) {
    throw new Error("Letterhead template image is missing.");
  }

  const inch = marginsToInches(config.margins);
  const generatedHeaderHtml = isGenerated
    ? buildGeneratedHeaderHtml(config.generatedLayout!)
    : "";
  const dateStr = formatDate(doc.date, locale);

  // --- Content blocks (each escaped; blank fields render as nothing) ---------
  const titleBlock = doc.title
    ? `<div class="title">${escapeHtml(doc.title)}</div>`
    : "";

  const dateBlock = `<div class="date-row">${escapeHtml(labels.date)}: ${escapeHtml(dateStr)}${
    doc.place?.trim()
      ? ` &nbsp;&middot;&nbsp; ${escapeHtml(doc.place.trim())}`
      : ""
  }</div>`;

  const referenceBlock = doc.reference?.trim()
    ? `<div class="reference">${escapeHtml(labels.reference)}: ${escapeHtml(doc.reference.trim())}</div>`
    : "";

  const recipientLines = [
    doc.recipientName?.trim(),
    doc.recipientDesignation?.trim(),
    doc.recipientCompany?.trim(),
    doc.recipientAddress?.trim(),
  ].filter((l): l is string => Boolean(l && l.length));
  const recipientBlock = recipientLines.length
    ? `<div class="recipient"><div class="recipient-label">${escapeHtml(labels.to)}:</div>${recipientLines
        .map((l) => `<div>${escapeHtml(l).replace(/\n/g, "<br/>")}</div>`)
        .join("")}</div>`
    : "";

  const subjectBlock = doc.subject?.trim()
    ? `<div class="subject"><strong>${escapeHtml(labels.subject)}: ${escapeHtml(doc.subject.trim())}</strong></div>`
    : "";

  const salutationBlock = doc.salutation?.trim()
    ? `<div class="salutation">${escapeHtml(doc.salutation.trim())}</div>`
    : "";

  const bodyBlock = doc.body
    ? `<div class="body">${escapeHtml(doc.body).replace(/\n/g, "<br/>")}</div>`
    : "";

  const closingBlock = doc.closing?.trim()
    ? `<div class="closing">${escapeHtml(doc.closing.trim())}</div>`
    : "";

  // --- Signature / stamp (optional, user-scoped assets on the config) --------
  const wantSignature = Boolean(doc.useSignature);
  const wantStamp = Boolean(doc.useStamp);
  const signatureSrc = config.signatureDataUri?.trim() || "";
  const stampSrc = config.stampDataUri?.trim() || "";

  if (wantSignature && !signatureSrc) warnings.push("letterhead.warnSignatureMissing");
  if (wantStamp && !stampSrc) warnings.push("letterhead.warnStampMissing");

  const signatureImg =
    wantSignature && signatureSrc
      ? `<img class="sign-img" src="${attrEsc(signatureSrc)}" alt="" />`
      : wantSignature
        ? `<div class="sign-space"></div>`
        : "";

  const stampImg =
    wantStamp && stampSrc
      ? `<img class="stamp-img" src="${attrEsc(stampSrc)}" alt="" />`
      : "";

  const signerName = doc.name?.trim()
    ? `<div class="signer-name">${escapeHtml(doc.name.trim())}</div>`
    : "";
  const signerRole = doc.designation?.trim()
    ? `<div class="signer-role">${escapeHtml(doc.designation.trim())}</div>`
    : "";

  const signBlock =
    signatureImg || stampImg || signerName || signerRole
      ? `<div class="sign-block">
          ${stampImg ? `<div class="stamp-wrap">${stampImg}</div>` : ""}
          ${signatureImg}
          ${signerName}
          ${signerRole}
        </div>`
      : "";

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
  @page {
    size: A4;
    margin: ${inch.top}in ${inch.right}in ${inch.bottom}in ${inch.left}in;
  }
  * { box-sizing: border-box; }
  html, body {
    margin: 0; padding: 0;
    background: #FFFFFF;
    font-family:
      -apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto",
      "Noto Sans", "Noto Sans Devanagari", "Mangal", "Kohinoor Devanagari",
      sans-serif;
    color: #0F1226;
    font-size: 11.5pt;
    line-height: 1.3;
    -webkit-font-smoothing: antialiased;
  }
  /* Full-page template layer; repeats on every printed page. */
  .letterhead-bg {
    position: fixed;
    top: 0;
    left: 0;
    width: 210mm;
    height: 297mm;
    z-index: 0;
    object-fit: contain;
    object-position: top center;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .generated-header {
    position: fixed;
    top: 0;
    left: 0;
    width: 210mm;
    padding: 12mm 14mm 6mm;
    z-index: 0;
    display: flex;
    flex-direction: row;
    align-items: flex-start;
    gap: 10pt;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .generated-header.align-center { justify-content: center; text-align: center; flex-direction: column; align-items: center; }
  .generated-header.align-right { justify-content: flex-end; text-align: right; flex-direction: row-reverse; }
  .generated-header.align-left { justify-content: flex-start; text-align: left; }
  .generated-logo {
    max-width: 72pt;
    max-height: 48pt;
    width: auto;
    height: auto;
    object-fit: contain;
  }
  /* Real CSS filters — mono is high-contrast B&W, not opacity greying. */
  .generated-logo.mono { filter: grayscale(1) contrast(3); }
  .generated-logo.grayscale { filter: grayscale(1); }
  .generated-text { font-size: 10pt; line-height: 1.35; color: #0F1226; }
  .generated-name { font-size: 13pt; font-weight: 700; margin-bottom: 2pt; }
  .content {
    position: relative;
    z-index: 1;
  }
  .title {
    font-size: 15pt;
    font-weight: 700;
    text-align: center;
    margin-bottom: 8pt;
  }
  .date-row {
    text-align: right;
    color: #5C5F7A;
    font-size: 10pt;
    margin-bottom: 8pt;
  }
  .reference {
    color: #5C5F7A;
    font-size: 10pt;
    margin-bottom: 8pt;
  }
  .recipient {
    margin-bottom: 12pt;
    line-height: 1.35;
  }
  .recipient-label {
    color: #5C5F7A;
    font-size: 10pt;
    margin-bottom: 2pt;
  }
  .subject {
    font-size: 11.5pt;
    margin-bottom: 10pt;
    padding-bottom: 4pt;
    border-bottom: 1pt solid #E6E8F0;
  }
  .salutation {
    margin-bottom: 8pt;
  }
  .body {
    white-space: pre-wrap;
    word-wrap: break-word;
    text-align: left;
    font-size: 11.5pt;
    line-height: 1.3;
  }
  .closing {
    margin-top: 16pt;
  }
  .sign-block {
    margin-top: 6pt;
    page-break-inside: avoid;
  }
  .stamp-wrap { margin-bottom: 4pt; }
  .stamp-img {
    max-width: ${STAMP_MAX_W}pt;
    max-height: ${STAMP_MAX_H}pt;
    width: auto;
    height: auto;
    object-fit: contain;
  }
  .sign-img {
    max-width: ${SIGNATURE_MAX_W}pt;
    max-height: ${SIGNATURE_MAX_H}pt;
    width: auto;
    height: auto;
    object-fit: contain;
    display: block;
    margin-bottom: 2pt;
  }
  .sign-space { height: ${SIGNATURE_MAX_H}pt; }
  .signer-name {
    font-weight: 700;
    font-size: 11.5pt;
  }
  .signer-role {
    color: #5C5F7A;
    font-size: 10pt;
    margin-top: 2pt;
  }
</style>
</head>
<body>
  ${
    isGenerated
      ? generatedHeaderHtml
      : `<img class="letterhead-bg" src="${attrEsc(templateSrc!)}" alt="" />`
  }
  <div class="content">
    ${titleBlock}
    ${dateBlock}
    ${referenceBlock}
    ${recipientBlock}
    ${subjectBlock}
    ${salutationBlock}
    ${bodyBlock}
    ${closingBlock}
    ${signBlock}
  </div>
</body>
</html>`;

  return { html, warnings };
  } finally {
    clearEnglishOnlyPdfContext();
  }
}

const attrEsc = escapeHtmlAttr;

function buildGeneratedHeaderHtml(
  layout: NonNullable<LetterheadConfig["generatedLayout"]>
): string {
  // Keep CSS class names in sync with letterheadVisualSpec.pdfAlignClass /
  // appearanceCssFilterClass (imported dynamically avoided to keep PDF pure).
  const alignClass =
    layout.logoAlign === "center"
      ? "align-center"
      : layout.logoAlign === "right"
        ? "align-right"
        : "align-left";
  const logoFilter =
    layout.appearance === "mono"
      ? "mono"
      : layout.appearance === "grayscale"
        ? "grayscale"
        : "";
  // Only embed durable data: URIs or https — never device-local file:// logos.
  const logoSrc = layout.logoUri?.trim() ?? "";
  const logoOk =
    logoSrc.startsWith("data:") ||
    logoSrc.startsWith("https://") ||
    logoSrc.startsWith("http://");
  const logo =
    logoOk
      ? `<img class="generated-logo ${logoFilter}" src="${attrEsc(logoSrc)}" alt="" />`
      : "";
  const lines = [
    layout.businessName?.trim(),
    layout.address?.trim(),
    layout.contact?.trim(),
    layout.gstin?.trim() ? `GSTIN: ${layout.gstin.trim()}` : null,
  ].filter((l): l is string => Boolean(l && l.length));
  const text = lines.length
    ? `<div class="generated-text">${lines
        .map((l, i) =>
          i === 0 && layout.businessName?.trim()
            ? `<div class="generated-name">${escapeHtml(l)}</div>`
            : `<div>${escapeHtml(l).replace(/\n/g, "<br/>")}</div>`
        )
        .join("")}</div>`
    : "";
  return `<div class="generated-header ${alignClass}">${logo}${text}</div>`;
}

function formatDate(ms: number, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale, {
      day: "2-digit",
      month: "long",
      year: "numeric",
    }).format(new Date(ms));
  } catch {
    return new Date(ms).toLocaleDateString();
  }
}
