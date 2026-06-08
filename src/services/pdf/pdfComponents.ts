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
  const name = branding.businessName?.trim() || branding.displayName?.trim() || "—";
  const personLine =
    branding.businessName?.trim() && branding.displayName?.trim()
      ? `<div class="pdf-issuer-line">${escapeHtml(branding.displayName)}</div>`
      : "";
  const ueidLine =
    showUeid && branding.ueid
      ? `<div class="pdf-issuer-line">Ref: ${escapeHtml(branding.ueid)}</div>`
      : "";

  return `<div class="pdf-issuer">
    ${logo}
    <div class="pdf-issuer-body">
      <div class="pdf-issuer-label">${escapeHtml(issuerLabel)}</div>
      <div class="pdf-issuer-name">${escapeHtml(name)}</div>
      ${personLine}
      ${ueidLine}
    </div>
  </div>`;
}
