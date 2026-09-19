import type { Firestore } from "firebase/firestore";

import { AppError } from "@/domain/errors";
import {
  computePurchaseOrderTotal,
  formatPoNumber,
  type PurchaseOrder,
} from "@/domain/purchaseOrder";
import { istMonthKeyForMillis } from "@/billing/istMonthKey";
import {
  allocateSerialCounter,
  runAtomicBillableCreate,
  type AtomicCreateHooks,
} from "@/billing/optionC/atomicBillableCreate";
import { stableRecordId } from "@/services/records/stableRecordId";

import type { CreatePurchaseOrderInput } from "./types";

function toCloud(po: PurchaseOrder): Record<string, unknown> {
  const { pdfUri: _omit, ...rest } = po;
  return { ...rest, pdfUri: null };
}

export function buildPurchaseOrderRecord(
  userId: string,
  id: string,
  serial: number,
  input: CreatePurchaseOrderInput,
  nowMs: number
): PurchaseOrder {
  return {
    id,
    userId,
    ueid: input.ueid,
    serial,
    poNumber: formatPoNumber(serial),
    status: "active",
    poDate: input.poDate,
    vendorName: input.vendorName.trim(),
    vendorGstin: input.vendorGstin ?? null,
    vendorAddress: input.vendorAddress ?? null,
    vendorPin: input.vendorPin ?? null,
    vendorState: input.vendorState ?? null,
    vendorContactName: input.vendorContactName ?? null,
    vendorContactPhone: input.vendorContactPhone ?? null,
    vendorContactEmail: input.vendorContactEmail ?? null,
    buyerName: input.buyerName.trim(),
    buyerAddress: input.buyerAddress ?? null,
    buyerGstin: input.buyerGstin ?? null,
    buyerPin: input.buyerPin ?? null,
    buyerState: input.buyerState ?? null,
    authorizedBy: input.authorizedBy ?? null,
    authorizedDesignation: input.authorizedDesignation ?? null,
    shipSameAsBuyer: input.shipSameAsBuyer ?? false,
    shipName: input.shipName ?? null,
    shipAddress: input.shipAddress ?? null,
    shipPin: input.shipPin ?? null,
    shipState: input.shipState ?? null,
    shipContact: input.shipContact ?? null,
    deliveryLocation: input.deliveryLocation ?? null,
    billingLocation: input.billingLocation ?? null,
    expectedDeliveryDate: input.expectedDeliveryDate ?? null,
    taxApplicable: input.taxApplicable ?? "none",
    gstRate: input.gstRate ?? null,
    useLogo: input.useLogo ?? false,
    items: input.items,
    total: input.total ?? computePurchaseOrderTotal(input.items),
    deliveryTerms: input.deliveryTerms ?? null,
    paymentTerms: input.paymentTerms ?? null,
    freightTerms: input.freightTerms ?? null,
    referenceNumber: input.referenceNumber ?? null,
    notes: input.notes ?? null,
    terms: input.terms ?? null,
    pdfUri: input.pdfUri ?? null,
    firstGeneratedAt: nowMs,
    lastEditedAt: null,
    version: 1,
    editHistory: [{ version: 1, at: nowMs, action: "created" }],
    cancelledAt: null,
    createdAt: nowMs,
    updatedAt: nowMs,
    deletedAt: null,
  };
}

export async function createPurchaseOrderAtomic(
  db: Firestore,
  userId: string,
  input: CreatePurchaseOrderInput,
  parseExisting: (id: string, data: Record<string, unknown>) => PurchaseOrder,
  hooks?: AtomicCreateHooks,
  nowMs = Date.now(),
  recordId = stableRecordId(input.clientRecordId, "po")
): Promise<PurchaseOrder> {
  if (!userId) throw new AppError("permission_denied", "Not signed in.");
  const monthKey = istMonthKeyForMillis(nowMs);
  const result = await runAtomicBillableCreate({
    db,
    userId,
    collection: "purchaseOrders",
    recordId,
    serialCounter: "purchaseOrder",
    nowMs,
    monthKey,
    parseExisting,
    buildNew: (serial) => {
      if (serial == null || serial < 1) {
        throw new AppError("save_failed", "Purchase order serial was not allocated.");
      }
      const record = buildPurchaseOrderRecord(userId, recordId, serial, input, nowMs);
      return { record, payload: toCloud(record) };
    },
    hooks,
  });
  return result.record;
}

export async function allocatePurchaseOrderSerialOnDb(
  db: Firestore,
  userId: string
): Promise<number> {
  if (!userId) throw new AppError("permission_denied", "Not signed in.");
  return allocateSerialCounter(db, userId, "purchaseOrder");
}
