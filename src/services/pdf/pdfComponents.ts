import { escapeHtml } from "@/utils/escapeHtml";
import type { UserPdfBranding } from "./userPdfBranding";
import { formatPdfDate, formatPdfDateTime } from "./pdfDate";

export interface PdfDocumentHeaderInput {
  title: string;
  documentType?: string | null;
  reference?: string | null;
  status?: string | null;
  recordDateMs?: number | null;
  generatedAtMs: number;
  locale?: string;
}

export function pdfDocumentHeader(input: PdfDocumentHeaderInput): string {
  const {
    title,
    documentType,
    reference,
    status,
    recordDateMs,
    generatedAtMs,
    locale = "en-IN",
  } = input;

  const metaLines: string[] = [];
  if (reference?.trim()) {
    metaLines.push(`<strong>${escapeHtml(reference.trim())}</strong>`);
  }
  if (recordDateMs) {
    metaLines.push(`Record date: ${escapeHtml(formatPdfDate(recordDateMs, locale))}`);
  }
  metaLines.push(`Generated: ${escapeHtml(formatPdfDateTime(generatedAtMs, locale))}`);

  const statusChip = status?.trim()
    ? `<span class="pdf-status-chip">${escapeHtml(status.trim())}</span>`
    : "";

  return `<header class="pdf-doc-header">
    <div class="pdf-doc-header-main">
      ${documentType?.trim() ? `<div class="pdf-doc-type">${escapeHtml(documentType.trim())}</div>` : ""}
      <h1 class="pdf-doc-title">${escapeHtml(title)}</h1>
    </div>
    <div class="pdf-doc-meta">
      ${metaLines.join("<br/>")}
      ${statusChip}
    </div>
  </header>`;
}

export interface PdfIssuerInput {
  branding: UserPdfBranding;
  issuerLabel?: string;
  showUeid?: boolean;
}

/** Business identity block — logo optional; UEID hidden on public PDFs by default. */
export function pdfIssuerBlock(input: PdfIssuerInput): string {
  const { branding, issuerLabel = "Issued by", showUeid = false } = input;
  const logo =
    branding.includeLogo && branding.logoDataUri
      ? `<img class="pdf-issuer-logo" src="${branding.logoDataUri}" alt=""/>`
      : "";

  const name = branding.displayName?.trim() || null;
  const business = branding.businessName?.trim() || null;
  const mobile = branding.mobile?.trim() || null;
  const email = branding.email?.trim() || null;

  const rows: Array<[string, string]> = [];
  if (name) rows.push(["Name", name]);
  if (business) rows.push(["Business", business]);
  if (mobile) rows.push(["Mobile", mobile]);
  if (email) rows.push(["Email", email]);
  if (!rows.length) rows.push(["Name", "—"]);

  const detailLines = rows
    .map(
      ([label, value]) =>
        `<div class="pdf-issuer-line"><span class="pdf-issuer-k">${escapeHtml(label)}</span> ${escapeHtml(value)}</div>`
    )
    .join("");

  const ueidLine =
    showUeid && branding.ueid
      ? `<div class="pdf-issuer-line">Ref: ${escapeHtml(branding.ueid)}</div>`
      : "";

  return `<div class="pdf-issuer">
    ${logo}
    <div class="pdf-issuer-body">
      <div class="pdf-issuer-label">${escapeHtml(issuerLabel)}</div>
      ${detailLines}
      ${ueidLine}
    </div>
  </div>`;
}
