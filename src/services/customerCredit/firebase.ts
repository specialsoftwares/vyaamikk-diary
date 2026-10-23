/**
 * Firestore-backed Customer Credit / EMI repository (shared-dev / prod).
 *
 * Collection layout:
 *   users/{uid}/customerCreditRecords/{id}
 *   users/{uid}/counters/customerCredit  → { next: number }
 *
 * First CREATE commits counter + record (and usageCurrent while enforcement
 * is on) in one transaction. PDF file URIs are never written remotely. All
 * reads/writes are user-scoped.
 */

import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  setDoc,
} from "firebase/firestore";

import { publishDomainChange } from "@/services/dataChanges/domainChanges";
import { AppError } from "@/domain/errors";
import { getFirebaseDb } from "@/config/firebase";
import {
  openBusinessCloud,
  protectBusinessCloud,
  settleCreatedBusinessCloud,
  prepareBusinessCreate,
} from "@/services/privacy/businessCloudSeal";
import {
  CREDIT_PAYMENT_MODES,
  CUSTOMER_DOCUMENT_TYPES,
  CREDIT_CHARGES_MODES,
  formatCreditNumber,
  type CreditChargesConfig,
  type CreditClosureMetadata,
  type CreditPaidBy,
  type BalanceClosureAdjustment,
  type CreditPaymentEntry,
  type CreditPaymentMode,
  type CustomerCreditEditHistoryEntry,
  type CustomerCreditProduct,
  type CustomerCreditRecord,
  type CustomerCreditStatus,
  type CustomerDocumentType,
  type CustomerPhotoRef,
  type EmiFrequency,
  type EmiInstallment,
} from "@/domain/customerCredit";
import { createLogger } from "@/utils/logger";
import {
  createCustomerCreditAtomic,
  allocateCustomerCreditSerialOnDb,
} from "./atomicCreate";
import {
  addCustomerCreditPaymentOnDb,
  closeCustomerCreditFullyPaidOnDb,
  mutateCustomerCreditOnDb,
} from "./recordMutations";

import { applyStatus, applyUpdate, removePaymentFrom } from "./shared";
import type { CloseFullyPaidInput } from "./types";
import type {
  CreateCustomerCreditInput,
  CustomerCreditRepository,
  ListCustomerCreditOptions,
  UpdateCustomerCreditInput,
} from "./types";

const log = createLogger("customerCredit/firebase");
const COLLECTION = "customerCreditRecords";

function userCollection(userId: string) {
  return collection(getFirebaseDb(), "users", userId, COLLECTION);
}
function recordDocRef(userId: string, id: string) {
  return doc(getFirebaseDb(), "users", userId, COLLECTION, id);
}

function num(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}
function optNum(v: unknown): number | null {
  return v == null ? null : num(v);
}
function optStr(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

const STATUSES: CustomerCreditStatus[] = [
  "active",
  "fully_paid",
  "cancelled",
  "written_off",
  "external_completed",
];
const DOCUMENT_TYPES = CUSTOMER_DOCUMENT_TYPES;

function photoFromRaw(raw: unknown): CustomerPhotoRef | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;
  if (typeof p.localUri !== "string" || !p.localUri) return null;
  return {
    localUri: p.localUri,
    mimeType: typeof p.mimeType === "string" ? p.mimeType : "image/jpeg",
    updatedAt: num(p.updatedAt, Date.now()),
    width: optNum(p.width),
    height: optNum(p.height),
  };
}

const PAID_BY: CreditPaidBy[] = ["customer", "family", "business_rep", "other"];
const ADJUSTMENTS: BalanceClosureAdjustment[] = [
  "exact",
  "discount_waiver",
  "round_off",
  "extra_charge",
];

function closureFromRaw(raw: unknown): CreditClosureMetadata | null {
  if (!raw || typeof raw !== "object") return null;
  const c = raw as Record<string, unknown>;
  const paidBy = PAID_BY.includes(c.paidBy as CreditPaidBy)
    ? (c.paidBy as CreditPaidBy)
    : "customer";
  const adjustment = ADJUSTMENTS.includes(c.adjustment as BalanceClosureAdjustment)
    ? (c.adjustment as BalanceClosureAdjustment)
    : "exact";
  if (!c.finalPaymentDate || !c.recordedBy) return null;
  return {
    finalPaymentDate: num(c.finalPaymentDate),
    finalPaymentAmount: num(c.finalPaymentAmount),
    paymentMode: (CREDIT_PAYMENT_MODES.includes(c.paymentMode as CreditPaymentMode)
      ? c.paymentMode
      : "cash") as CreditPaymentMode,
    paymentReference: optStr(c.paymentReference),
    paidBy,
    payerName: optStr(c.payerName),
    payerRelation: optStr(c.payerRelation),
    payerMobile: optStr(c.payerMobile),
    recordedBy: String(c.recordedBy),
    closingRemarks: optStr(c.closingRemarks),
    paymentProofUri: optStr(c.paymentProofUri),
    balanceAtClosure: num(c.balanceAtClosure),
    adjustment,
    adjustmentAmount: optNum(c.adjustmentAmount),
    adjustmentNote: optStr(c.adjustmentNote),
    closedAt: num(c.closedAt, Date.now()),
  };
}

function chargesFromRaw(raw: unknown): CreditChargesConfig | null {
  if (!raw || typeof raw !== "object") return null;
  const c = raw as Record<string, unknown>;
  const mode = CREDIT_CHARGES_MODES.includes(c.mode as CreditChargesConfig["mode"])
    ? (c.mode as CreditChargesConfig["mode"])
    : "none";
  if (mode === "none") return { mode };
  return {
    mode,
    base: c.base === "sale" ? "sale" : c.base === "principal" ? "principal" : null,
    fixedAmount: optNum(c.fixedAmount),
    fixedLabel: optStr(c.fixedLabel),
    interestPercent: optNum(c.interestPercent),
    processingPercent: optNum(c.processingPercent),
    processingAmount: optNum(c.processingAmount),
    processingUpfront: c.processingUpfront === true,
    customLabel: optStr(c.customLabel),
    customAmount: optNum(c.customAmount),
    financeProvided: c.financeProvided === true,
    manualChargesAmount: optNum(c.manualChargesAmount),
    manualEntered: c.manualEntered === true,
  };
}
const MODES = ["cash", "credit", "shop_emi", "external_finance", "mixed"] as const;
const PAY_MODES: CreditPaymentMode[] = [
  "cash",
  "upi",
  "card",
  "bank_transfer",
  "cheque",
  "other",
];

function fromDoc(
  id: string,
  raw: Record<string, unknown>,
  userId: string
): CustomerCreditRecord {
  const products: CustomerCreditProduct[] = Array.isArray(raw.products)
    ? (raw.products as Record<string, unknown>[]).map((p) => ({
        productName: String(p.productName ?? ""),
        brandModel: optStr(p.brandModel),
        serialImei: optStr(p.serialImei),
        saleAmount: num(p.saleAmount),
        invoiceNumber: optStr(p.invoiceNumber),
      }))
    : [];
  const schedule: EmiInstallment[] = Array.isArray(raw.schedule)
    ? (raw.schedule as Record<string, unknown>[]).map((it, i) => ({
        seq: num(it.seq, i + 1),
        dueDate: num(it.dueDate),
        amount: num(it.amount),
      }))
    : [];
  const payments: CreditPaymentEntry[] = Array.isArray(raw.payments)
    ? (raw.payments as Record<string, unknown>[]).map((p) => ({
        id: String(p.id ?? ""),
        amount: num(p.amount),
        paidDate: num(p.paidDate),
        mode: PAY_MODES.includes(p.mode as CreditPaymentMode)
          ? (p.mode as CreditPaymentMode)
          : "cash",
        reference: optStr(p.reference),
        note: optStr(p.note),
        createdAt: num(p.createdAt),
      }))
    : [];
  const mode = MODES.includes(raw.mode as (typeof MODES)[number])
    ? (raw.mode as CustomerCreditRecord["mode"])
    : "credit";
  return {
    id,
    userId,
    ueid: String(raw.ueid ?? ""),
    serial: num(raw.serial),
    recordNumber: String(raw.recordNumber ?? formatCreditNumber(num(raw.serial, 1))),
    status: STATUSES.includes(raw.status as CustomerCreditStatus)
      ? (raw.status as CustomerCreditStatus)
      : "active",
    mode,
    saleDate: num(raw.saleDate, Date.now()),

    customerName: String(raw.customerName ?? ""),
    customerMobile: optStr(raw.customerMobile),
    customerAltContact: optStr(raw.customerAltContact),
    customerAddress: optStr(raw.customerAddress),
    customerLocality: optStr(raw.customerLocality),
    customerCity: optStr(raw.customerCity),
    customerState: optStr(raw.customerState),
    customerPin: optStr(raw.customerPin),
    customerEmail: optStr(raw.customerEmail),

    customerPhoto: photoFromRaw(raw.customerPhoto),
    documentType: DOCUMENT_TYPES.includes(raw.documentType as CustomerDocumentType)
      ? (raw.documentType as CustomerDocumentType)
      : null,
    documentReference: optStr(raw.documentReference),

    products,

    saleAmount: num(raw.saleAmount),
    downPayment: optNum(raw.downPayment),
    interestCharges: optNum(raw.interestCharges),
    charges: chargesFromRaw(raw.charges),
    upfrontCharges: optNum(raw.upfrontCharges),
    totalPayable: optNum(raw.totalPayable),

    emiFrequency: (["monthly", "weekly", "custom"].includes(raw.emiFrequency as string)
      ? raw.emiFrequency
      : null) as EmiFrequency | null,
    emiCount: optNum(raw.emiCount),
    emiAmount: optNum(raw.emiAmount),
    firstDueDate: optNum(raw.firstDueDate),
    customIntervalDays: optNum(raw.customIntervalDays),
    schedule,

    payments,

    financerName: optStr(raw.financerName),
    financeRefNumber: optStr(raw.financeRefNumber),
    financeDownPayment: optNum(raw.financeDownPayment),
    financeAmount: optNum(raw.financeAmount),
    shopFollowUpRequired: raw.shopFollowUpRequired === true,

    guarantorName: optStr(raw.guarantorName),
    remarks: optStr(raw.remarks),

    idAttachmentConsentAt: optNum(raw.idAttachmentConsentAt),
    hasIdAttachment: raw.hasIdAttachment === true,

    pdfUri: typeof raw.pdfUri === "string" ? raw.pdfUri : null,

    reminderAt: optNum(raw.reminderAt),
    reminderNotificationId: optStr(raw.reminderNotificationId),

    firstGeneratedAt: num(raw.firstGeneratedAt, num(raw.createdAt, Date.now())),
    lastEditedAt: optNum(raw.lastEditedAt),
    version: num(raw.version, 1),
    editHistory: Array.isArray(raw.editHistory)
      ? (raw.editHistory as CustomerCreditEditHistoryEntry[])
      : [],
    cancelledAt: optNum(raw.cancelledAt),
    closedAt: optNum(raw.closedAt),
    closure: closureFromRaw(raw.closure),

    createdAt: num(raw.createdAt, Date.now()),
    updatedAt: num(raw.updatedAt, Date.now()),
    deletedAt: optNum(raw.deletedAt),
  };
}

/** Strip device-local PDF path + customer photo (device-local) before remote write. */
function toCloud(record: CustomerCreditRecord): Record<string, unknown> {
  const { pdfUri: _pdf, customerPhoto: _photo, closure, ...rest } = record;
  const closureCloud = closure
    ? { ...closure, paymentProofUri: null }
    : null;
  return { ...rest, pdfUri: null, customerPhoto: null, closure: closureCloud };
}

function creditCloudOptions(userId: string, recordId: string) {
  return {
    restoreRaw: async (raw: Record<string, unknown>) => {
      const opened = await openBusinessCloud(
        "customerCreditRecords",
        fromDoc(recordId, raw, userId),
        raw
      );
      return { ...raw, ...opened };
    },
    protectCloud: async (record: CustomerCreditRecord, raw: Record<string, unknown>) =>
      protectBusinessCloud({
        collection: "customerCreditRecords",
        userId,
        recordId: record.id,
        revision: record.updatedAt,
        plain: toCloud(record),
        existingRaw: raw,
      }),
  };
}

async function materializeCredit(
  id: string,
  raw: Record<string, unknown>,
  userId: string
): Promise<CustomerCreditRecord> {
  return openBusinessCloud("customerCreditRecords", fromDoc(id, raw, userId), raw);
}

export const firebaseCustomerCreditRepository: CustomerCreditRepository = {
  async allocateSerial(userId) {
    return allocateCustomerCreditSerialOnDb(getFirebaseDb(), userId);
  },

  async create(userId, input: CreateCustomerCreditInput) {
    const record = await createCustomerCreditAtomic(getFirebaseDb(), userId, input, (id, data) =>
      fromDoc(id, data, userId),
      { prepareCloudPayload: prepareBusinessCreate("customerCreditRecords", userId) }
    );
    return settleCreatedBusinessCloud({
      collection: "customerCreditRecords",
      userId,
      record,
      readRaw: async () => {
        const snap = await getDoc(recordDocRef(userId, record.id));
        return snap.exists() ? (snap.data() as Record<string, unknown>) : null;
      },
      writeCloud: async (cloud) => {
        await setDoc(recordDocRef(userId, record.id), cloud, { merge: true });
      },
    });
  },

  async update(userId, input: UpdateCustomerCreditInput) {
    const next = await mutateCustomerCreditOnDb(
      getFirebaseDb(),
      userId,
      input.id,
      (existing, now) => applyUpdate(existing, input, now),
      (id, data) => fromDoc(id, data, userId),
      Date.now(),
      creditCloudOptions(userId, input.id)
    );
    publishDomainChange(userId, "customerCredit", { effect: "upsert", recordId: next.id });
    return next;
  },

  async addPayment(userId, recordId, payment) {
    const next = await addCustomerCreditPaymentOnDb(
      getFirebaseDb(),
      userId,
      recordId,
      payment,
      (id, data) => fromDoc(id, data, userId),
      Date.now(),
      creditCloudOptions(userId, recordId)
    );
    publishDomainChange(userId, "customerCredit", { effect: "upsert", recordId });
    return next;
  },

  async removePayment(userId, recordId, paymentId) {
    const next = await mutateCustomerCreditOnDb(
      getFirebaseDb(),
      userId,
      recordId,
      (existing, now) => removePaymentFrom(existing, paymentId, now),
      (id, data) => fromDoc(id, data, userId),
      Date.now(),
      creditCloudOptions(userId, recordId)
    );
    publishDomainChange(userId, "customerCredit", { effect: "upsert", recordId });
    return next;
  },

  async setStatus(userId, recordId, status) {
    const next = await mutateCustomerCreditOnDb(
      getFirebaseDb(),
      userId,
      recordId,
      (existing, now) => applyStatus(existing, status, now),
      (id, data) => fromDoc(id, data, userId),
      Date.now(),
      creditCloudOptions(userId, recordId)
    );
    publishDomainChange(userId, "customerCredit", { effect: "upsert", recordId });
    return next;
  },

  async closeFullyPaid(userId, input: CloseFullyPaidInput) {
    const next = await closeCustomerCreditFullyPaidOnDb(
      getFirebaseDb(),
      userId,
      input,
      (id, data) => fromDoc(id, data, userId),
      Date.now(),
      creditCloudOptions(userId, input.recordId)
    );
    publishDomainChange(userId, "customerCredit", { effect: "upsert", recordId: input.recordId });
    return next;
  },

  async setReminder(userId, recordId, reminder) {
    const next = await mutateCustomerCreditOnDb(
      getFirebaseDb(),
      userId,
      recordId,
      (existing) => ({
        ...existing,
        reminderAt: reminder.reminderAt,
        reminderNotificationId: reminder.reminderNotificationId,
      }),
      (id, data) => fromDoc(id, data, userId),
      Date.now(),
      creditCloudOptions(userId, recordId)
    );
    return next;
  },

  async remove(userId, id) {
    try {
      await deleteDoc(recordDocRef(userId, id));
      publishDomainChange(userId, "customerCredit", { effect: "delete", recordId: id });
      log.info("credit record removed (firebase)");
    } catch (e) {
      log.warn("credit remove failed", e);
      throw new AppError("delete_failed", "Could not delete the record.");
    }
  },

  async getById(userId, id) {
    if (!userId || !id) return null;
    const snap = await getDoc(recordDocRef(userId, id));
    if (!snap.exists()) return null;
    return materializeCredit(snap.id, snap.data() as Record<string, unknown>, userId);
  },

  async list(userId, options: ListCustomerCreditOptions = {}) {
    if (!userId) return [];
    const snap = await getDocs(query(userCollection(userId), orderBy("serial", "desc")));
    let out = await Promise.all(
      snap.docs.map((d) => materializeCredit(d.id, d.data() as Record<string, unknown>, userId))
    );
    if (!options.includeDeleted) out = out.filter((r) => !r.deletedAt);
    if (options.search?.trim()) {
      const needle = options.search.trim().toLowerCase();
      out = out.filter((r) =>
        [r.recordNumber, r.customerName, r.products[0]?.productName ?? "", r.remarks ?? ""]
          .join(" ")
          .toLowerCase()
          .includes(needle)
      );
    }
    if (options.limit && options.limit > 0) out = out.slice(0, options.limit);
    return out;
  },
};
