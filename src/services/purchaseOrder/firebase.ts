/**
 * Firestore-backed Purchase Order repository (shared-dev / prod).
 *
 * Collection layout:
 *   users/{uid}/purchaseOrders/{poId}
 *   users/{uid}/counters/purchaseOrder  → { next: number }
 *
 * Serial allocation uses a Firestore transaction on the counter doc so two
 * concurrent creates can never receive the same number. PDF file URIs are
 * never written remotely.
 */

import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  runTransaction,
  setDoc,
} from "firebase/firestore";

import { AppError } from "@/domain/errors";
import { getFirebaseDb } from "@/config/firebase";
import {
  computePurchaseOrderTotal,
  formatPoNumber,
  type PurchaseOrder,
  type PurchaseOrderItem,
} from "@/domain/purchaseOrder";
import { stableRecordId } from "@/services/records/stableRecordId";
import { createLogger } from "@/utils/logger";

import type {
  CreatePurchaseOrderInput,
  ListPurchaseOrdersOptions,
  PurchaseOrderRepository,
  UpdatePurchaseOrderInput,
} from "./types";

const log = createLogger("purchaseOrder/firebase");
const COLLECTION = "purchaseOrders";

function userCollection(userId: string) {
  return collection(getFirebaseDb(), "users", userId, COLLECTION);
}
function poDocRef(userId: string, id: string) {
  return doc(getFirebaseDb(), "users", userId, COLLECTION, id);
}
function counterDocRef(userId: string) {
  return doc(getFirebaseDb(), "users", userId, "counters", "purchaseOrder");
}

function num(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}
function optStr(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

function fromDoc(id: string, raw: Record<string, unknown>, userId: string): PurchaseOrder {
  const items: PurchaseOrderItem[] = Array.isArray(raw.items)
    ? (raw.items as Record<string, unknown>[]).map((it) => ({
        itemName: String(it.itemName ?? it.description ?? ""),
        descriptionLines: Array.isArray(it.descriptionLines)
          ? (it.descriptionLines as unknown[]).map((l) => String(l ?? ""))
          : [],
        quantity: num(it.quantity),
        unit: optStr(it.unit),
        rate: num(it.rate),
        taxRate: it.taxRate == null ? null : num(it.taxRate),
        amount: num(it.amount),
      }))
    : [];
  return {
    id,
    userId,
    ueid: String(raw.ueid ?? ""),
    serial: num(raw.serial),
    poNumber: String(raw.poNumber ?? formatPoNumber(num(raw.serial, 1))),
    status: raw.status === "cancelled" ? "cancelled" : "active",
    poDate: num(raw.poDate, Date.now()),
    vendorName: String(raw.vendorName ?? ""),
    vendorGstin: optStr(raw.vendorGstin),
    vendorAddress: optStr(raw.vendorAddress),
    vendorPin: optStr(raw.vendorPin),
    vendorState: optStr(raw.vendorState),
    vendorContactName: optStr(raw.vendorContactName),
    vendorContactPhone: optStr(raw.vendorContactPhone),
    vendorContactEmail: optStr(raw.vendorContactEmail),
    buyerName: String(raw.buyerName ?? ""),
    buyerAddress: optStr(raw.buyerAddress),
    buyerGstin: optStr(raw.buyerGstin),
    buyerPin: optStr(raw.buyerPin),
    buyerState: optStr(raw.buyerState),
    authorizedBy: optStr(raw.authorizedBy),
    authorizedDesignation: optStr(raw.authorizedDesignation),
    shipSameAsBuyer: raw.shipSameAsBuyer === true,
    shipName: optStr(raw.shipName),
    shipAddress: optStr(raw.shipAddress),
    shipPin: optStr(raw.shipPin),
    shipState: optStr(raw.shipState),
    shipContact: optStr(raw.shipContact),
    deliveryLocation: optStr(raw.deliveryLocation),
    billingLocation: optStr(raw.billingLocation),
    expectedDeliveryDate: raw.expectedDeliveryDate == null ? null : num(raw.expectedDeliveryDate),
    taxApplicable:
      raw.taxApplicable === "applicable" || raw.taxApplicable === "as_applicable"
        ? raw.taxApplicable
        : "none",
    gstRate: raw.gstRate == null ? null : num(raw.gstRate),
    useLogo: raw.useLogo === true,
    items,
    total: num(raw.total, computePurchaseOrderTotal(items)),
    deliveryTerms: optStr(raw.deliveryTerms),
    paymentTerms: optStr(raw.paymentTerms),
    freightTerms: optStr(raw.freightTerms),
    referenceNumber: optStr(raw.referenceNumber),
    notes: optStr(raw.notes),
    terms: optStr(raw.terms),
    pdfUri: typeof raw.pdfUri === "string" ? raw.pdfUri : null,
    firstGeneratedAt: num(raw.firstGeneratedAt, num(raw.createdAt, Date.now())),
    lastEditedAt: raw.lastEditedAt == null ? null : num(raw.lastEditedAt),
    version: num(raw.version, 1),
    editHistory: Array.isArray(raw.editHistory)
      ? (raw.editHistory as PurchaseOrder["editHistory"])
      : [],
    cancelledAt: raw.cancelledAt == null ? null : num(raw.cancelledAt),
    createdAt: num(raw.createdAt, Date.now()),
    updatedAt: num(raw.updatedAt, Date.now()),
    deletedAt: raw.deletedAt == null ? null : num(raw.deletedAt),
  };
}

/** Strip device-local PDF path before remote write. */
function toCloud(po: PurchaseOrder): Record<string, unknown> {
  const { pdfUri: _omit, ...rest } = po;
  return { ...rest, pdfUri: null };
}

export const firebasePurchaseOrderRepository: PurchaseOrderRepository = {
  async allocateSerial(userId) {
    if (!userId) throw new AppError("permission_denied", "Not signed in.");
    const ref = counterDocRef(userId);
    return runTransaction(getFirebaseDb(), async (tx) => {
      const snap = await tx.get(ref);
      const current = snap.exists() ? num((snap.data() as { next?: number }).next) : 0;
      const next = current + 1;
      tx.set(ref, { next, updatedAt: Date.now() }, { merge: true });
      return next;
    });
  },

  async create(userId, input) {
    if (!userId) throw new AppError("permission_denied", "Not signed in.");
    const id = stableRecordId(input.clientRecordId, "po");
    const ref = poDocRef(userId, id);
    const existingSnap = await getDoc(ref);
    if (existingSnap.exists()) {
      return fromDoc(existingSnap.id, existingSnap.data() as Record<string, unknown>, userId);
    }

    const serial = await this.allocateSerial(userId);
    const now = Date.now();
    const po: PurchaseOrder = {
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
      firstGeneratedAt: now,
      lastEditedAt: null,
      version: 1,
      editHistory: [{ version: 1, at: now, action: "created" }],
      cancelledAt: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
    await setDoc(poDocRef(userId, id), toCloud(po));
    log.info("po created (firebase)");
    return po;
  },

  async update(userId, input) {
    const ref = poDocRef(userId, input.id);
    const snap = await getDoc(ref);
    if (!snap.exists()) throw new AppError("not_found", "Purchase order not found.");
    const existing = fromDoc(snap.id, snap.data() as Record<string, unknown>, userId);
    const now = Date.now();
    const items = input.items ?? existing.items;
    const next: PurchaseOrder = {
      ...existing,
      vendorName: input.vendorName?.trim() ?? existing.vendorName,
      vendorGstin: input.vendorGstin === undefined ? existing.vendorGstin : input.vendorGstin,
      vendorAddress:
        input.vendorAddress === undefined ? existing.vendorAddress : input.vendorAddress,
      vendorPin: input.vendorPin === undefined ? existing.vendorPin : input.vendorPin,
      vendorState: input.vendorState === undefined ? existing.vendorState : input.vendorState,
      vendorContactName:
        input.vendorContactName === undefined
          ? existing.vendorContactName
          : input.vendorContactName,
      vendorContactPhone:
        input.vendorContactPhone === undefined
          ? existing.vendorContactPhone
          : input.vendorContactPhone,
      vendorContactEmail:
        input.vendorContactEmail === undefined
          ? existing.vendorContactEmail
          : input.vendorContactEmail,
      buyerName: input.buyerName?.trim() ?? existing.buyerName,
      buyerAddress:
        input.buyerAddress === undefined ? existing.buyerAddress : input.buyerAddress,
      buyerGstin: input.buyerGstin === undefined ? existing.buyerGstin : input.buyerGstin,
      buyerPin: input.buyerPin === undefined ? existing.buyerPin : input.buyerPin,
      buyerState: input.buyerState === undefined ? existing.buyerState : input.buyerState,
      authorizedBy:
        input.authorizedBy === undefined ? existing.authorizedBy : input.authorizedBy,
      authorizedDesignation:
        input.authorizedDesignation === undefined
          ? existing.authorizedDesignation
          : input.authorizedDesignation,
      shipSameAsBuyer:
        input.shipSameAsBuyer === undefined
          ? existing.shipSameAsBuyer ?? false
          : input.shipSameAsBuyer,
      shipName: input.shipName === undefined ? existing.shipName : input.shipName,
      shipAddress: input.shipAddress === undefined ? existing.shipAddress : input.shipAddress,
      shipPin: input.shipPin === undefined ? existing.shipPin : input.shipPin,
      shipState: input.shipState === undefined ? existing.shipState : input.shipState,
      shipContact: input.shipContact === undefined ? existing.shipContact : input.shipContact,
      deliveryLocation:
        input.deliveryLocation === undefined
          ? existing.deliveryLocation
          : input.deliveryLocation,
      billingLocation:
        input.billingLocation === undefined
          ? existing.billingLocation
          : input.billingLocation,
      expectedDeliveryDate:
        input.expectedDeliveryDate === undefined
          ? existing.expectedDeliveryDate
          : input.expectedDeliveryDate,
      taxApplicable:
        input.taxApplicable === undefined ? existing.taxApplicable : input.taxApplicable,
      gstRate: input.gstRate === undefined ? existing.gstRate : input.gstRate,
      useLogo: input.useLogo === undefined ? existing.useLogo : input.useLogo,
      items,
      total: input.total ?? computePurchaseOrderTotal(items),
      deliveryTerms:
        input.deliveryTerms === undefined ? existing.deliveryTerms : input.deliveryTerms,
      paymentTerms:
        input.paymentTerms === undefined ? existing.paymentTerms : input.paymentTerms,
      freightTerms:
        input.freightTerms === undefined ? existing.freightTerms : input.freightTerms,
      referenceNumber:
        input.referenceNumber === undefined
          ? existing.referenceNumber
          : input.referenceNumber,
      notes: input.notes === undefined ? existing.notes : input.notes,
      terms: input.terms === undefined ? existing.terms : input.terms,
      pdfUri: input.pdfUri === undefined ? existing.pdfUri : input.pdfUri,
      lastEditedAt: now,
      version: existing.version + 1,
      editHistory: [
        ...existing.editHistory,
        { version: existing.version + 1, at: now, action: "edited" },
      ],
      updatedAt: now,
    };
    await setDoc(ref, toCloud(next), { merge: true });
    return next;
  },

  async cancel(userId, id) {
    const ref = poDocRef(userId, id);
    const snap = await getDoc(ref);
    if (!snap.exists()) throw new AppError("not_found", "Purchase order not found.");
    const existing = fromDoc(snap.id, snap.data() as Record<string, unknown>, userId);
    const now = Date.now();
    const next: PurchaseOrder = {
      ...existing,
      status: "cancelled",
      cancelledAt: now,
      version: existing.version + 1,
      editHistory: [
        ...existing.editHistory,
        { version: existing.version + 1, at: now, action: "cancelled" },
      ],
      updatedAt: now,
    };
    await setDoc(ref, toCloud(next), { merge: true });
    return next;
  },

  async remove(userId, id) {
    try {
      await deleteDoc(poDocRef(userId, id));
      log.info("po removed (firebase)");
    } catch (e) {
      log.warn("po remove failed", e);
      throw new AppError("delete_failed", "Could not delete the purchase order.");
    }
  },

  async getById(userId, id) {
    if (!userId || !id) return null;
    const snap = await getDoc(poDocRef(userId, id));
    if (!snap.exists()) return null;
    return fromDoc(snap.id, snap.data() as Record<string, unknown>, userId);
  },

  async list(userId, options = {}) {
    if (!userId) return [];
    const snap = await getDocs(query(userCollection(userId), orderBy("serial", "desc")));
    let out = snap.docs.map((d) =>
      fromDoc(d.id, d.data() as Record<string, unknown>, userId)
    );
    if (!options.includeDeleted) out = out.filter((p) => !p.deletedAt);
    if (options.search?.trim()) {
      const needle = options.search.trim().toLowerCase();
      out = out.filter((p) =>
        [p.poNumber, p.vendorName, p.referenceNumber ?? "", p.notes ?? ""]
          .join(" ")
          .toLowerCase()
          .includes(needle)
      );
    }
    if (options.limit && options.limit > 0) out = out.slice(0, options.limit);
    return out;
  },
};
