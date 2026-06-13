import { dayKey } from "@/utils/date";

export type PdfDocumentType =
  | "cashPaid"
  | "paymentRequest"
  | "purchaseOrder"
  | "materialMovement"
  | "letterhead"
  | "professionalBrief"
  | "dukaan"
  | "diaryEntry"
  | "generic";

const MAX_FILENAME_LEN = 120;
const PDF_EXT = ".pdf";

const INVALID_FILENAME_CHARS = /[:*?"<>|]/g;
const EMOJI_PATTERN = /\p{Extended_Pictographic}/gu;

const PARTY_FALLBACK = "Party";
const RECORD_FALLBACK = "Record";

/** Sanitize a single filename segment (no extension). */
export function sanitizeSegment(raw: string | null | undefined, fallback = RECORD_FALLBACK): string {
  if (raw == null || !String(raw).trim()) return fallback;

  const cleaned = String(raw)
    .normalize("NFKD")
    .replace(EMOJI_PATTERN, "")
    .replace(/[/\\]+/g, "-")
    .replace(INVALID_FILENAME_CHARS, "")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\s/g, "-")
    .replace(/[^A-Za-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");

  return cleaned.length > 0 ? cleaned : fallback;
}

function resolveDate(input?: string): string {
  if (input?.trim()) {
    const cleaned = sanitizeSegment(input.trim(), "");
    if (cleaned) return cleaned;
  }
  return dayKey(Date.now());
}

function truncateFileName(fileName: string): string {
  if (fileName.length <= MAX_FILENAME_LEN) return fileName;
  const stem = fileName.endsWith(PDF_EXT) ? fileName.slice(0, -PDF_EXT.length) : fileName;
  const maxStemLen = MAX_FILENAME_LEN - PDF_EXT.length;
  const truncated = stem.slice(0, maxStemLen).replace(/-+$/, "");
  const safeStem = truncated.length > 0 ? truncated : "Vyaamikk-Document";
  return `${safeStem}${PDF_EXT}`;
}

function ensurePdfExtension(fileName: string): string {
  const base = fileName.endsWith(PDF_EXT) ? fileName.slice(0, -PDF_EXT.length) : fileName;
  const stem = base.length > 0 ? base : "Vyaamikk-Document";
  return `${stem}${PDF_EXT}`;
}

function finalizeFileName(stem: string): string {
  return truncateFileName(ensurePdfExtension(stem));
}

export interface PdfFileNameBase {
  date?: string;
}

export interface CashPaidPdfFileNameInput extends PdfFileNameBase {
  documentType: "cashPaid";
  receiverName?: string;
  cpvSerial?: string;
}

export interface PaymentRequestPdfFileNameInput extends PdfFileNameBase {
  documentType: "paymentRequest";
  partyName?: string;
  amountOrInvoice?: string;
}

export interface PurchaseOrderPdfFileNameInput extends PdfFileNameBase {
  documentType: "purchaseOrder";
  supplierName?: string;
  poSerial?: string;
}

export interface MaterialMovementPdfFileNameInput extends PdfFileNameBase {
  documentType: "materialMovement";
  fromPin?: string;
  toPin?: string;
}

export interface LetterheadPdfFileNameInput extends PdfFileNameBase {
  documentType: "letterhead";
  businessName?: string;
}

export interface ProfessionalBriefPdfFileNameInput extends PdfFileNameBase {
  documentType: "professionalBrief";
  titleOrParty?: string;
}

export interface DukaanPdfFileNameInput extends PdfFileNameBase {
  documentType: "dukaan";
  customerName?: string;
}

export interface DiaryEntryPdfFileNameInput extends PdfFileNameBase {
  documentType: "diaryEntry";
  recordShortId?: string;
  title?: string;
}

export interface GenericPdfFileNameInput extends PdfFileNameBase {
  documentType: "generic";
  recordShortId?: string;
  title?: string;
}

export type PdfFileNameInput =
  | CashPaidPdfFileNameInput
  | PaymentRequestPdfFileNameInput
  | PurchaseOrderPdfFileNameInput
  | MaterialMovementPdfFileNameInput
  | LetterheadPdfFileNameInput
  | ProfessionalBriefPdfFileNameInput
  | DukaanPdfFileNameInput
  | DiaryEntryPdfFileNameInput
  | GenericPdfFileNameInput;

function fallbackRecordId(input: { recordShortId?: string; title?: string }): string {
  return sanitizeSegment(input.recordShortId ?? input.title, RECORD_FALLBACK);
}

export function buildPdfFileName(input: PdfFileNameInput): string {
  const date = resolveDate(input.date);

  switch (input.documentType) {
    case "cashPaid": {
      const receiver = sanitizeSegment(input.receiverName, PARTY_FALLBACK);
      const serial = sanitizeSegment(input.cpvSerial, RECORD_FALLBACK);
      return finalizeFileName(
        `Vyaamikk-Cash-Payment-Voucher-${receiver}-${serial}-${date}`
      );
    }
    case "paymentRequest": {
      const party = sanitizeSegment(input.partyName, PARTY_FALLBACK);
      const amount = sanitizeSegment(input.amountOrInvoice, RECORD_FALLBACK);
      return finalizeFileName(`Vyaamikk-Payment-Request-${party}-${amount}-${date}`);
    }
    case "purchaseOrder": {
      const supplier = sanitizeSegment(input.supplierName, PARTY_FALLBACK);
      const serial = sanitizeSegment(input.poSerial, RECORD_FALLBACK);
      return finalizeFileName(`Vyaamikk-Purchase-Order-${supplier}-${serial}-${date}`);
    }
    case "materialMovement": {
      const fromPin = sanitizeSegment(input.fromPin, "From");
      const toPin = sanitizeSegment(input.toPin, "To");
      return finalizeFileName(
        `Vyaamikk-Material-Movement-${fromPin}-to-${toPin}-${date}`
      );
    }
    case "letterhead": {
      const business = sanitizeSegment(input.businessName, "Business");
      return finalizeFileName(`Vyaamikk-Letterhead-${business}-${date}`);
    }
    case "professionalBrief": {
      const title = sanitizeSegment(input.titleOrParty, RECORD_FALLBACK);
      return finalizeFileName(`Vyaamikk-Professional-Brief-${title}-${date}`);
    }
    case "dukaan": {
      const customer = sanitizeSegment(input.customerName, PARTY_FALLBACK);
      return finalizeFileName(`Vyaamikk-Dukaan-Record-${customer}-${date}`);
    }
    case "diaryEntry": {
      const recordId = fallbackRecordId(input);
      return finalizeFileName(`Vyaamikk-Diary-Entry-${recordId}-${date}`);
    }
    case "generic": {
      const recordId = fallbackRecordId(input);
      return finalizeFileName(`Vyaamikk-Generic-${recordId}-${date}`);
    }
    default: {
      const _exhaustive: never = input;
      return finalizeFileName(`Vyaamikk-Document-${date}`);
    }
  }
}

/** Legacy path for callers that only pass a free-form hint string. */
export function buildPdfFileNameFromHint(hint: string): string {
  const trimmed = hint.trim();
  if (!trimmed) {
    return buildPdfFileName({ documentType: "generic", recordShortId: RECORD_FALLBACK });
  }
  return buildPdfFileName({ documentType: "generic", title: trimmed });
}

/** Map a diary business entry to a structured export filename. */
export function buildPdfFileNameForBusinessEntry(
  entry: import("@/domain/businessEntry").BusinessEntry,
  options?: { businessName?: string | null; date?: string }
): PdfFileNameInput {
  const date = options?.date ?? dayKey(entry.entryDate);
  const shortId = entry.id.slice(-8);

  switch (entry.entryType) {
    case "business_cash_given": {
      const p = entry.payload as import("@/domain/businessEntry").BusinessCashGivenPayload;
      return {
        documentType: "cashPaid",
        receiverName: p.givenToName,
        cpvSerial: (p.cashPaidVoucherSerial ?? shortId).replace(/\//g, "-"),
        date,
      };
    }
    case "payment_request": {
      const p = entry.payload as import("@/domain/businessEntry").PaymentRequestPayload;
      return {
        documentType: "paymentRequest",
        partyName: p.partyName ?? entry.title,
        amountOrInvoice: p.invoiceNumber?.trim() || String(p.pendingAmount ?? entry.title),
        date,
      };
    }
    case "material_dispatched": {
      const p = entry.payload as import("@/domain/businessEntry").MaterialDispatchedPayload;
      return {
        documentType: "materialMovement",
        fromPin: p.dispatchFromPostal?.pinCode ?? p.dispatchLocation ?? "From",
        toPin: p.deliveryToPostal?.pinCode ?? p.destination ?? "To",
        date,
      };
    }
    default:
      return {
        documentType: "diaryEntry",
        recordShortId: shortId,
        title: entry.title,
        date,
      };
  }
}
