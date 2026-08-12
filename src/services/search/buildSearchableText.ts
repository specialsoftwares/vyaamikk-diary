/**
 * Builds normalized searchable plain text per record — all meaningful metadata.
 * Bank account numbers and IFSC are excluded; mobile is last-4 only.
 */

import type { BusinessEntry } from "@/domain/businessEntry";
import type { ProfessionalServicePack } from "@/domain/professionalPack";
import type { CustomerCreditRecord } from "@/domain/customerCredit";
import type { LetterheadDocument } from "@/services/letterhead";
import { dayKey, formatEntryDate } from "@/utils/date";
import { buildSearchableLocationText } from "@/utils/location/entryLocation";
import {
  appendAmount,
  appendMobileLast4,
  appendText,
  digitsOnly,
  normalizeSearchText,
} from "./normalize";

function appendRecordValues(parts: string[], record: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(record)) {
    if (key === "accountNumber" || key === "ifsc" || key === "upiId") continue;
    if (key === "bankDetails" && value && typeof value === "object") {
      const b = value as Record<string, unknown>;
      appendText(parts, b.accountHolderName);
      appendText(parts, b.bankName);
      appendText(parts, b.paymentInstruction);
      continue;
    }
    if (typeof value === "string") appendText(parts, value);
    else if (typeof value === "number" && Number.isFinite(value)) {
      if (key.toLowerCase().includes("amount") || key === "pendingAmount" || key === "totalWeight") {
        appendAmount(parts, value);
      } else {
        appendText(parts, value);
      }
    } else if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === "string") appendText(parts, item);
      }
    }
  }
}

function appendDocumentHistory(parts: string[], entry: BusinessEntry): void {
  const dh = entry.documentHistory;
  if (!dh) return;
  if (dh.versionNumber) appendText(parts, `v${dh.versionNumber}`);
  if (dh.firstGeneratedAt) appendText(parts, dayKey(dh.firstGeneratedAt));
  if (dh.lastGeneratedAt) appendText(parts, dayKey(dh.lastGeneratedAt));
  for (const gen of dh.pdfGenerationHistory ?? []) {
    appendText(parts, `pdf v${gen.versionNumber}`);
    appendText(parts, dayKey(gen.generatedAt));
  }
  for (const edit of dh.editHistory ?? []) {
    appendText(parts, edit.previousSummary);
    appendText(parts, edit.newSummary);
    for (const fn of edit.fieldNames ?? []) appendText(parts, fn);
  }
}

export function buildEntrySearchableText(entry: BusinessEntry): string {
  const parts: string[] = [];
  appendText(parts, entry.title);
  appendText(parts, entry.notes);
  appendText(parts, entry.ueid);
  appendText(parts, entry.status);
  appendText(parts, entry.source);
  const locText = buildSearchableLocationText(entry);
  if (locText) appendText(parts, locText);
  if (entry.location?.gps?.addressLabel) appendText(parts, entry.location.gps.addressLabel);
  if (entry.reminder?.note) appendText(parts, entry.reminder.note);
  appendText(parts, dayKey(entry.entryDate));
  appendText(parts, dayKey(entry.updatedAt));

  const p = entry.payload as unknown as Record<string, unknown>;
  appendRecordValues(parts, p);

  switch (entry.entryType) {
    case "payment_request": {
      appendAmount(parts, p.pendingAmount as number);
      appendText(parts, p.invoiceNumber);
      appendText(parts, p.partyName);
      appendText(parts, p.contactPerson);
      appendText(parts, p.requestNote);
      break;
    }
    case "outward_freight_details": {
      appendText(parts, p.billNumber);
      appendText(parts, p.lrGrNumber);
      appendText(parts, p.deliveryLocation);
      appendText(parts, p.dispatchFromLocation);
      appendText(parts, p.transporterName);
      appendText(parts, p.vehicleNumber);
      appendText(parts, p.clarificationContactName);
      appendText(parts, p.partyName);
      appendText(parts, p.materialName);
      appendText(parts, p.dispatchTitle);
      appendText(parts, p.ewayBillNumber);
      appendText(parts, p.referenceNote);
      appendText(parts, p.freightType);
      appendMobileLast4(parts, p.clarificationContactMobile as string);
      break;
    }
    case "material_dispatched": {
      appendText(parts, p.invoiceChallan);
      appendText(parts, p.dispatchLocation);
      appendText(parts, p.destination);
      appendText(parts, p.transporter);
      appendText(parts, p.lrGrNumber);
      appendText(parts, p.vehicleNumber);
      appendText(parts, p.partyName);
      appendText(parts, p.materialName);
      appendText(parts, p.ewayBillNumber);
      appendText(parts, p.referenceNote);
      break;
    }
    case "business_cash_given": {
      appendAmount(parts, p.amount as number);
      appendText(parts, p.givenToName);
      appendText(parts, p.purpose);
      appendText(parts, p.paymentDate ? formatEntryDate(Number(p.paymentDate)) : null);
      appendText(parts, formatEntryDate(entry.createdAt));
      appendMobileLast4(parts, p.contactMobile as string);
      break;
    }
    case "reminder_gst_return": {
      appendText(parts, p.returnType);
      appendText(parts, p.taxPeriod);
      appendText(parts, "gstr-3b");
      appendText(parts, "gstr3b");
      appendText(parts, "gst");
      break;
    }
    case "legacy": {
      const tags = p.tags as string[] | undefined;
      if (Array.isArray(tags)) for (const tag of tags) appendText(parts, tag);
      break;
    }
    default:
      break;
  }

  if ((entry.attachments?.length ?? 0) > 0) {
    appendText(parts, "has_attachment");
  }

  appendDocumentHistory(parts, entry);
  const joined = parts.join(" ");
  const withDigits = `${joined} ${digitsOnly(joined)}`;
  return normalizeSearchText(withDigits);
}

export function buildLetterheadSearchableText(doc: LetterheadDocument): string {
  const parts: string[] = [];
  appendText(parts, doc.title);
  appendText(parts, doc.ueid);
  const inp = doc.input;
  appendText(parts, inp.title);
  appendText(parts, inp.reference);
  appendText(parts, inp.recipientName);
  appendText(parts, inp.recipientDesignation);
  appendText(parts, inp.recipientCompany);
  appendText(parts, inp.recipientAddress);
  appendText(parts, inp.subject);
  appendText(parts, inp.body);
  appendText(parts, inp.closing);
  appendText(parts, inp.name);
  appendText(parts, inp.designation);
  appendText(parts, inp.place);
  appendText(parts, dayKey(inp.date));
  return normalizeSearchText(parts.join(" "));
}

/**
 * Searchable text for a Customer Credit / EMI record. Mobile is indexed last-4
 * only; no full ID/document numbers are indexed (none are stored). Product
 * serial/IMEI + invoice numbers are operational and indexed via the digits pass.
 */
export function buildCustomerCreditSearchableText(record: CustomerCreditRecord): string {
  const parts: string[] = [];
  appendText(parts, record.recordNumber);
  appendText(parts, record.ueid);
  appendText(parts, record.customerName);
  appendMobileLast4(parts, record.customerMobile ?? undefined);
  appendText(parts, record.customerAddress);
  appendText(parts, record.customerPin);
  appendText(parts, record.customerState);
  appendText(parts, record.status);
  appendText(parts, record.mode);
  appendText(parts, record.financerName);
  appendText(parts, record.financeRefNumber);
  appendText(parts, record.guarantorName);
  appendText(parts, record.remarks);
  appendAmount(parts, record.saleAmount);
  if (record.emiAmount) appendAmount(parts, record.emiAmount);
  appendText(parts, dayKey(record.saleDate));
  if (record.firstDueDate) {
    appendText(parts, dayKey(record.firstDueDate));
  }
  for (const p of record.products) {
    appendText(parts, p.productName);
    appendText(parts, p.brandModel);
    appendText(parts, p.serialImei);
    appendText(parts, p.invoiceNumber);
    appendAmount(parts, p.saleAmount);
  }
  const joined = parts.join(" ");
  const withDigits = `${joined} ${digitsOnly(joined)}`;
  return normalizeSearchText(withDigits);
}

export function buildProfessionalPackSearchableText(pack: ProfessionalServicePack): string {
  const parts: string[] = [];
  appendText(parts, pack.title);
  appendText(parts, pack.ueid);
  appendText(parts, pack.professionalCategory);
  appendText(parts, pack.matterType);
  appendText(parts, pack.status);
  appendText(parts, pack.notes);
  appendText(parts, pack.professionalName);
  appendMobileLast4(parts, pack.professionalContact);
  for (const v of Object.values(pack.facts ?? {})) {
    if (typeof v === "string") appendText(parts, v);
    else if (typeof v === "number") appendAmount(parts, v);
  }
  return normalizeSearchText(parts.join(" "));
}
