/**
 * Shared, persistence-agnostic builders for Customer Credit records. Both the
 * mock (AsyncStorage) and firebase repositories use these so create / update /
 * payment / status logic stays identical across backends.
 */

import {
  computeCreditSummary,
  computeProductsTotal,
  formatCreditNumber,
  type CreditClosureMetadata,
  type CreditPaymentEntry,
  type CustomerCreditRecord,
  type CustomerCreditStatus,
} from "@/domain/customerCredit";
import { stableRecordId } from "@/services/records/stableRecordId";
import { shortId } from "@/utils/id";

import type {
  CreateCustomerCreditInput,
  UpdateCustomerCreditInput,
} from "./types";

function s(v?: string | null): string | null {
  const t = (v ?? "").toString().trim();
  return t.length > 0 ? t : null;
}

function n(v?: number | null): number | null {
  return v != null && Number.isFinite(v) ? v : null;
}

/**
 * Build a brand-new record from create input + an allocated serial.
 * `recordId` must be captured once by the caller (including for absent/blank
 * clientRecordId) and reused on transaction retries. Do not call
 * stableRecordId again inside this builder.
 */
export function buildNewRecord(
  userId: string,
  serial: number,
  input: CreateCustomerCreditInput,
  now: number,
  recordId: string
): CustomerCreditRecord {
  const products = input.products ?? [];
  return {
    id: recordId,
    userId,
    ueid: input.ueid,
    serial,
    recordNumber: formatCreditNumber(serial),
    status: "active",
    mode: input.mode,
    saleDate: input.saleDate,

    customerName: input.customerName.trim(),
    customerMobile: s(input.customerMobile),
    customerAltContact: s(input.customerAltContact),
    customerAddress: s(input.customerAddress),
    customerLocality: s(input.customerLocality),
    customerCity: s(input.customerCity),
    customerState: s(input.customerState),
    customerPin: s(input.customerPin),
    customerEmail: s(input.customerEmail),

    customerPhoto: input.customerPhoto ?? null,
    documentType: input.documentType ?? null,
    documentReference: s(input.documentReference),

    products,

    saleAmount: n(input.saleAmount) ?? computeProductsTotal(products),
    downPayment: n(input.downPayment),
    interestCharges: n(input.interestCharges),
    charges: input.charges ?? null,
    upfrontCharges: n(input.upfrontCharges),
    totalPayable: n(input.totalPayable),

    emiFrequency: input.emiFrequency ?? null,
    emiCount: n(input.emiCount),
    emiAmount: n(input.emiAmount),
    firstDueDate: n(input.firstDueDate),
    customIntervalDays: n(input.customIntervalDays),
    schedule: input.schedule ?? [],

    payments: [],

    financerName: s(input.financerName),
    financeRefNumber: s(input.financeRefNumber),
    financeDownPayment: n(input.financeDownPayment),
    financeAmount: n(input.financeAmount),
    shopFollowUpRequired: input.shopFollowUpRequired ?? false,

    guarantorName: s(input.guarantorName),
    remarks: s(input.remarks),

    idAttachmentConsentAt: n(input.idAttachmentConsentAt),
    hasIdAttachment: input.hasIdAttachment ?? false,

    pdfUri: s(input.pdfUri),

    reminderAt: null,
    reminderNotificationId: null,

    firstGeneratedAt: now,
    lastEditedAt: null,
    version: 1,
    editHistory: [{ version: 1, at: now, action: "created" }],
    cancelledAt: null,
    closedAt: null,
    closure: null,

    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
}

/** keep existing when the patch field is undefined; otherwise take the patch. */
function pick<T>(patch: T | undefined, existing: T): T {
  return patch === undefined ? existing : patch;
}

/** Apply an edit, bumping version + appending an "edited" history entry. */
export function applyUpdate(
  existing: CustomerCreditRecord,
  input: UpdateCustomerCreditInput,
  now: number
): CustomerCreditRecord {
  const products = input.products ?? existing.products;
  const nextVersion = existing.version + 1;
  return {
    ...existing,
    mode: pick(input.mode, existing.mode),
    saleDate: pick(input.saleDate, existing.saleDate),

    customerName: input.customerName?.trim() ?? existing.customerName,
    customerMobile: pick(input.customerMobile, existing.customerMobile),
    customerAltContact: pick(input.customerAltContact, existing.customerAltContact),
    customerAddress: pick(input.customerAddress, existing.customerAddress),
    customerLocality: pick(input.customerLocality, existing.customerLocality),
    customerCity: pick(input.customerCity, existing.customerCity),
    customerState: pick(input.customerState, existing.customerState),
    customerPin: pick(input.customerPin, existing.customerPin),
    customerEmail: pick(input.customerEmail, existing.customerEmail),

    customerPhoto: pick(input.customerPhoto, existing.customerPhoto),
    documentType: pick(input.documentType, existing.documentType),
    documentReference: pick(input.documentReference, existing.documentReference),

    products,

    saleAmount: pick(input.saleAmount, existing.saleAmount),
    downPayment: pick(input.downPayment, existing.downPayment),
    interestCharges: pick(input.interestCharges, existing.interestCharges),
    charges: pick(input.charges, existing.charges),
    upfrontCharges: pick(input.upfrontCharges, existing.upfrontCharges),
    totalPayable: pick(input.totalPayable, existing.totalPayable),

    emiFrequency: pick(input.emiFrequency, existing.emiFrequency),
    emiCount: pick(input.emiCount, existing.emiCount),
    emiAmount: pick(input.emiAmount, existing.emiAmount),
    firstDueDate: pick(input.firstDueDate, existing.firstDueDate),
    customIntervalDays: pick(input.customIntervalDays, existing.customIntervalDays),
    schedule: pick(input.schedule, existing.schedule),

    financerName: pick(input.financerName, existing.financerName),
    financeRefNumber: pick(input.financeRefNumber, existing.financeRefNumber),
    financeDownPayment: pick(input.financeDownPayment, existing.financeDownPayment),
    financeAmount: pick(input.financeAmount, existing.financeAmount),
    shopFollowUpRequired: pick(input.shopFollowUpRequired, existing.shopFollowUpRequired),

    guarantorName: pick(input.guarantorName, existing.guarantorName),
    remarks: pick(input.remarks, existing.remarks),

    idAttachmentConsentAt: pick(input.idAttachmentConsentAt, existing.idAttachmentConsentAt),
    hasIdAttachment: pick(input.hasIdAttachment, existing.hasIdAttachment),

    status: pick(input.status, existing.status),
    pdfUri: pick(input.pdfUri, existing.pdfUri),

    reminderAt: pick(input.reminderAt, existing.reminderAt),
    reminderNotificationId: pick(input.reminderNotificationId, existing.reminderNotificationId),

    lastEditedAt: now,
    version: nextVersion,
    editHistory: [...existing.editHistory, { version: nextVersion, at: now, action: "edited" }],
    updatedAt: now,
  };
}

/** Append a payment to the ledger; auto-mark fully_paid when balance clears. */
export function appendPayment(
  existing: CustomerCreditRecord,
  payment: Omit<CreditPaymentEntry, "id" | "createdAt"> & { clientPaymentId?: string },
  now: number
): CustomerCreditRecord {
  const payId = stableRecordId(payment.clientPaymentId, "pay");
  if (existing.payments.some((p) => p.id === payId)) {
    return existing;
  }
  const entry: CreditPaymentEntry = {
    id: payId,
    amount: Number.isFinite(payment.amount) ? payment.amount : 0,
    paidDate: payment.paidDate,
    mode: payment.mode,
    reference: payment.reference ?? null,
    note: payment.note ?? null,
    createdAt: now,
  };
  const nextVersion = existing.version + 1;
  const payments = [...existing.payments, entry];
  // Auto-close an active shop receivable once its balance clears.
  const summary = computeCreditSummary({ ...existing, payments }, now);
  const autoClose =
    existing.status === "active" && summary.totalPayable > 0 && summary.balance <= 0;
  return {
    ...existing,
    payments,
    status: autoClose ? "fully_paid" : existing.status,
    closedAt: autoClose ? now : existing.closedAt,
    lastEditedAt: now,
    version: nextVersion,
    editHistory: [
      ...existing.editHistory,
      { version: nextVersion, at: now, action: autoClose ? "settled" : "payment_added" },
    ],
    updatedAt: now,
  };
}

export function removePaymentFrom(
  existing: CustomerCreditRecord,
  paymentId: string,
  now: number
): CustomerCreditRecord {
  const nextVersion = existing.version + 1;
  return {
    ...existing,
    payments: existing.payments.filter((p) => p.id !== paymentId),
    lastEditedAt: now,
    version: nextVersion,
    editHistory: [...existing.editHistory, { version: nextVersion, at: now, action: "edited" }],
    updatedAt: now,
  };
}

export function applyStatus(
  existing: CustomerCreditRecord,
  status: CustomerCreditStatus,
  now: number
): CustomerCreditRecord {
  const nextVersion = existing.version + 1;
  const action =
    status === "cancelled" ? "cancelled" : status === "active" ? "edited" : "settled";
  return {
    ...existing,
    status,
    cancelledAt: status === "cancelled" ? now : existing.cancelledAt,
    closedAt:
      status === "fully_paid" ||
      status === "written_off" ||
      status === "external_completed"
        ? now
        : existing.closedAt,
    lastEditedAt: now,
    version: nextVersion,
    editHistory: [...existing.editHistory, { version: nextVersion, at: now, action }],
    updatedAt: now,
  };
}

export function applyFullClosure(
  existing: CustomerCreditRecord,
  closure: CreditClosureMetadata,
  options: { appendPayment: boolean; clientPaymentId?: string },
  now: number
): CustomerCreditRecord {
  if (existing.status === "fully_paid" && existing.closure) {
    return existing;
  }
  let record = existing;
  if (options.appendPayment && closure.finalPaymentAmount > 0) {
    record = appendPayment(
      record,
      {
        amount: closure.finalPaymentAmount,
        paidDate: closure.finalPaymentDate,
        mode: closure.paymentMode,
        reference: closure.paymentReference ?? null,
        note: closure.closingRemarks ?? null,
        clientPaymentId: options.clientPaymentId,
      },
      now
    );
  }
  const nextVersion = record.version + 1;
  return {
    ...record,
    status: "fully_paid",
    closure,
    closedAt: closure.closedAt,
    lastEditedAt: now,
    version: nextVersion,
    editHistory: [
      ...record.editHistory,
      { version: nextVersion, at: now, action: "closed" as const },
    ],
    updatedAt: now,
  };
}

/** A short, human title for previews / search snippets. */
export function recordTitle(record: CustomerCreditRecord): string {
  const product = record.products[0]?.productName?.trim();
  return product ? `${record.customerName} · ${product}` : record.customerName;
}
