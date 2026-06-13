/**
 * Cash Payment Voucher PDF — Field Voucher and Full Legal Record modes.
 *
 * // QR verification: deferred to V1.1
 */

import type {
  BusinessCashGivenPayload,
  BusinessEntry,
} from "@/domain/businessEntry";
import type { UserProfile } from "@/domain/types";
import type { Lang } from "@/i18n/types";
import { buildPdfFileName, type PdfFileNameInput } from "@/services/pdf/pdfFileNames";
import { cashPaidPhotoAttachment } from "@/services/attachments/cashPaidPhotoService";
import { amountInWordsForVoucher } from "@/services/pdf/amountInWords";
import { pdfIssuerBlock } from "@/services/pdf/pdfComponents";
import { buildPdfHtmlDocument } from "@/services/pdf/pdfDocumentShell";
import { formatPdfDate, formatPdfDateTime } from "@/services/pdf/pdfDate";
import { gujaratiPdfBodyFontCss, gujaratiPdfFontFaceCss } from "@/services/pdf/pdfGujaratiFont";
import {
  pdfLegalFooterHtml,
  pdfLegalLabelsFromT,
  type PdfLegalFooterLabels,
} from "@/services/pdf/pdfLegalFooter";
import { getPdfLabels, pdfLabel } from "@/services/pdf/pdfLabels";
import { pdfKvRow, pdfSection } from "@/services/pdf/pdfSections";
import { getUserPdfBranding } from "@/services/pdf/userPdfBranding";
import { escapeHtml } from "@/utils/escapeHtml";
import { formatAmount } from "@/utils/formatters/formatAmount";
import { dayKey } from "@/utils/date";

export type CashPaidPdfMode = "fieldVoucher" | "fullLegalRecord";

function cashPaidLabels(uiLang?: Lang) {
  return getPdfLabels(uiLang);
}

type CashPaidLabels = ReturnType<typeof cashPaidLabels>;

export interface GenerateCashPaidVoucherPdfInput {
  entry: BusinessEntry;
  user: UserProfile;
  mode: CashPaidPdfMode;
  t: (key: string, vars?: Record<string, string | number>) => string;
  uiLang?: Lang;
}

export interface GenerateCashPaidVoucherPdfResult {
  html: string;
  fileName: PdfFileNameInput;
}

function strVal(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s || null;
}

function formatMobileForPdf(mobile: string | null | undefined): string | null {
  const raw = mobile?.trim();
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) {
    return `+91 ${digits.slice(2, 4)} ${digits.slice(4, 8)} ${digits.slice(8)}`;
  }
  if (digits.length === 10) {
    return `+91 ${digits.slice(0, 2)} ${digits.slice(2, 6)} ${digits.slice(6)}`;
  }
  return raw;
}

async function resolvePhotoSrc(
  entry: BusinessEntry,
  payload: BusinessCashGivenPayload
): Promise<string | null> {
  if (payload.photoAttachmentDownloadUrl?.trim()) {
    return payload.photoAttachmentDownloadUrl.trim();
  }

  const attachment = cashPaidPhotoAttachment(entry.attachments);
  if (attachment?.downloadUrl?.trim()) {
    return attachment.downloadUrl.trim();
  }
  if (attachment?.uri?.trim()) {
    return attachment.uri.trim();
  }

  const storagePath =
    payload.photoAttachmentStoragePath?.trim() || attachment?.storagePath?.trim() || null;
  if (storagePath) {
    try {
      const { getDownloadUrlForPath } = await import("@/services/storage/userStorage");
      return await getDownloadUrlForPath(storagePath);
    } catch {
      return null;
    }
  }

  return null;
}

function signatureBlock(label: string, nameHint: string | null): string {
  return `<div class="cpv-signature">
    <div class="cpv-signature-label">${escapeHtml(label)}</div>
    ${nameHint ? `<div class="cpv-signature-name">${escapeHtml(nameHint)}</div>` : ""}
    <div class="cpv-signature-line"></div>
    <div class="cpv-signature-caption">Signature</div>
  </div>`;
}

function witnessSection(labels: CashPaidLabels): string {
  const blocks = [1, 2]
    .map(
      (n) => `<div class="cpv-witness">
        ${signatureBlock(`${labels.witness} ${n}`, null)}
        <div class="cpv-witness-meta">${pdfKvRow("Name", "")}${pdfKvRow(labels.mobile, "")}</div>
      </div>`
    )
    .join("");
  return `<div class="cpv-witness-section">
    <div class="pdf-section-label">${escapeHtml(labels.witness)}</div>
    <div class="cpv-witness-grid">${blocks}</div>
  </div>`;
}

const CPV_EXTRA_CSS = `
  .cpv-title {
    text-align: center;
    font-size: 14pt;
    font-weight: 700;
    letter-spacing: 0.6pt;
    margin: 10pt 0 8pt;
    text-transform: uppercase;
  }
  .cpv-serial {
    text-align: center;
    font-size: 10pt;
    font-weight: 700;
    color: #3b41c5;
    margin-bottom: 10pt;
  }
  .cpv-amount-box {
    border: 1pt solid #d8dbe8;
    border-radius: 6pt;
    padding: 8pt 10pt;
    margin: 8pt 0;
    background: #fafbff;
  }
  .cpv-amount-figures {
    font-size: 16pt;
    font-weight: 700;
    color: #0f1226;
  }
  .cpv-amount-words {
    margin-top: 4pt;
    font-size: 9pt;
    color: #3b4158;
  }
  .cpv-photo {
    margin-top: 8pt;
    text-align: center;
  }
  .cpv-photo img {
    max-width: 100%;
    max-height: 180pt;
    border: 1pt solid #e6e8f0;
    border-radius: 4pt;
  }
  .cpv-signatures {
    display: flex;
    gap: 12pt;
    margin-top: 18pt;
    page-break-inside: avoid;
  }
  .cpv-signature {
    flex: 1;
    min-width: 0;
  }
  .cpv-signature-label {
    font-size: 8pt;
    font-weight: 700;
    color: #5c5f7a;
    text-transform: uppercase;
    margin-bottom: 18pt;
  }
  .cpv-signature-name {
    font-size: 9pt;
    margin-bottom: 4pt;
  }
  .cpv-signature-line {
    border-bottom: 1pt solid #0f1226;
    height: 1pt;
    margin-bottom: 4pt;
  }
  .cpv-signature-caption {
    font-size: 7.5pt;
    color: #5c5f7a;
  }
  .cpv-witness-section { margin-top: 14pt; page-break-inside: avoid; }
  .cpv-witness-grid { display: flex; gap: 12pt; }
  .cpv-witness { flex: 1; }
  .cpv-footer-meta {
    margin-top: 16pt;
    padding-top: 8pt;
    border-top: 1pt solid #e6e8f0;
    font-size: 7.5pt;
    color: #5c5f7a;
    line-height: 1.45;
    page-break-inside: avoid;
  }
  .cpv-disclaimer { margin-top: 4pt; }
  .cpv-legal-footer { margin-top: 8pt; font-size: 7pt; color: #9ca3af; }
`;

export async function generateCashPaidVoucherPdf(
  input: GenerateCashPaidVoucherPdfInput
): Promise<GenerateCashPaidVoucherPdfResult> {
  const { entry, user, mode, t, uiLang = "en" } = input;
  if (entry.entryType !== "business_cash_given") {
    throw new Error("Cash paid voucher PDF requires a business_cash_given entry.");
  }

  const payload = entry.payload as BusinessCashGivenPayload;
  const labels = cashPaidLabels(uiLang);
  const locale = "en-IN";
  const generatedAtMs = Date.now();
  const legal: PdfLegalFooterLabels = pdfLegalLabelsFromT(t);
  const branding = await getUserPdfBranding(user, { t });
  const paymentDateMs = payload.paymentDate ?? entry.entryDate;
  const cpvSerial = payload.cashPaidVoucherSerial?.trim() || "—";
  const receiverMobile = formatMobileForPdf(payload.receiverMobile ?? payload.contactMobile);
  const photoSrc = await resolvePhotoSrc(entry, payload);

  let extraCss = CPV_EXTRA_CSS;
  if (uiLang === "gu") {
    const fontFace = await gujaratiPdfFontFaceCss();
    extraCss = `${fontFace}${gujaratiPdfBodyFontCss()}${CPV_EXTRA_CSS}`;
  }

  const issuer = pdfIssuerBlock({
    branding,
    issuerLabel: t("pdf.userProfileTitle"),
    showUeid: false,
  });

  const amountFigures = formatAmount(payload.amount);
  const amountWords = amountInWordsForVoucher(payload.amount);

  const detailsRows =
    pdfKvRow(labels.date, formatPdfDate(paymentDateMs, locale)) +
    pdfKvRow(labels.paymentTime, formatPdfDateTime(entry.createdAt, locale)) +
    pdfKvRow(labels.paymentMode, payload.paymentMode?.trim() || "Cash") +
    pdfKvRow(labels.paidTo, payload.givenToName) +
    pdfKvRow(labels.receiverMobile, receiverMobile) +
    pdfKvRow(labels.businessRef, strVal(payload.businessRef)) +
    pdfKvRow(labels.siteRef, strVal(payload.siteRef)) +
    pdfKvRow(labels.remarks, strVal(payload.remarks));

  const photoBlock = photoSrc
    ? `<div class="cpv-photo">
        <div class="pdf-section-label">${escapeHtml(labels.photoEvidence)}</div>
        <img src="${escapeHtml(photoSrc)}" alt=""/>
      </div>`
    : "";

  const witnessBlock = mode === "fullLegalRecord" ? witnessSection(labels) : "";

  const disclaimer = t("legal.disclaimerNotParty");
  const recordFooter = `<div class="cpv-footer-meta">
    <div><strong>${escapeHtml(labels.recordId)}:</strong> ${escapeHtml(entry.id)}</div>
    <div class="cpv-disclaimer"><strong>${escapeHtml(labels.voucherDisclaimer)}:</strong> ${escapeHtml(disclaimer)}</div>
    <div class="cpv-legal-footer">${pdfLegalFooterHtml({
      labels: legal,
      generatedAtMs,
      generatedByName: branding.displayName,
      ueid: branding.ueid,
      locale,
      fixed: false,
    })}</div>
  </div>`;

  const bodyHtml = `${issuer}
    <div class="cpv-title">${escapeHtml(labels.voucherTitle)}</div>
    <div class="cpv-serial">${escapeHtml(labels.cpvSerial)}: ${escapeHtml(cpvSerial)}</div>
    <div class="cpv-amount-box">
      <div class="cpv-amount-figures">${escapeHtml(labels.amountFigures)}: ${escapeHtml(amountFigures)}</div>
      <div class="cpv-amount-words">${escapeHtml(labels.amountWords)}: ${escapeHtml(amountWords)}</div>
    </div>
    ${pdfSection(labels.purpose, pdfKvRow(labels.purpose, payload.purpose))}
    ${pdfSection(pdfLabel("details", { uiLang }), detailsRows)}
    ${photoBlock}
    <div class="cpv-signatures">
      ${signatureBlock(labels.preparedBy, branding.displayName)}
      ${signatureBlock(labels.receivedBy, payload.givenToName)}
    </div>
    ${witnessBlock}
    ${recordFooter}`;

  const html = buildPdfHtmlDocument({
    locale,
    bodyHtml,
    extraCss,
    footer: {
      generatedAtMs,
      locale,
      pageLabel: legal.page,
      fixed: true,
      showGenerated: false,
    },
  });

  const fileName: PdfFileNameInput = {
    documentType: "cashPaid",
    receiverName: payload.givenToName,
    cpvSerial: cpvSerial.replace(/\//g, "-"),
    date: dayKey(paymentDateMs),
  };

  return { html, fileName };
}
