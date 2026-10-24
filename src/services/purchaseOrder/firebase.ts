/**
 * Firestore-backed Purchase Order repository (shared-dev / prod).
 *
 * Collection layout:
 *   users/{uid}/purchaseOrders/{poId}
 *   users/{uid}/counters/purchaseOrder  → { next: number }
 *
 * First CREATE commits counter + record (and usageCurrent while enforcement
 * is on) in one transaction. PDF file URIs are never written remotely.
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
  type DocumentReference,
  type DocumentSnapshot,
  type Firestore,
} from "firebase/firestore";

import { AppError } from "@/domain/errors";
import { currentAuthMutationGeneration } from "@/services/auth/authSessionFence";
import {
  commitExpectedRevision,
  nextContentRevision,
  RevisionConflict,
  settleIssuedWrite,
} from "@/services/privacy/expectedRevisionCommit";
import { getFirebaseDb } from "@/config/firebase";
import {
  openBusinessCloud,
  protectBusinessCloud,
  settleCreatedBusinessCloud,
  prepareBusinessCreate,
} from "@/services/privacy/businessCloudSeal";
import {
  computePurchaseOrderTotal,
  formatPoNumber,
  type PurchaseOrder,
  type PurchaseOrderItem,
} from "@/domain/purchaseOrder";
import { createLogger } from "@/utils/logger";
import { createPurchaseOrderAtomic, allocatePurchaseOrderSerialOnDb } from "./atomicCreate";

import type {
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

async function materializePo(id: string, raw: Record<string, unknown>, userId: string) {
  return openBusinessCloud("purchaseOrders", fromDoc(id, raw, userId), raw);
}

function purchaseOrderEffectPresent(
  stored: PurchaseOrder,
  proposed: PurchaseOrder,
  kind: "edit" | "cancel"
): boolean {
  if (kind === "cancel") return stored.status === "cancelled";
  const ignore = new Set(["updatedAt", "lastEditedAt", "version", "editHistory", "pdfUri"]);
  const left = { ...stored } as Record<string, unknown>;
  const right = { ...proposed } as Record<string, unknown>;
  for (const key of ignore) {
    delete left[key];
    delete right[key];
  }
  return JSON.stringify(left) === JSON.stringify(right);
}

async function commitPo(
  db: Firestore,
  ref: DocumentReference,
  userId: string,
  next: PurchaseOrder,
  existingRaw: Record<string, unknown> | null,
  generationAtStart: number
) {
  const cloud = await protectBusinessCloud({
    collection: "purchaseOrders",
    userId,
    recordId: next.id,
    revision: next.updatedAt,
    plain: toCloud(next),
    existingRaw,
  });
  await commitExpectedRevision({
    db,
    ref,
    expectedRevision: Number(existingRaw?.updatedAt),
    cloud,
    generationAtStart,
    currentGeneration: currentAuthMutationGeneration,
  });
}

export async function updatePurchaseOrderOnDb(
  db: Firestore,
  userId: string,
  input: UpdatePurchaseOrderInput,
  deps?: { ref?: DocumentReference; read?: (ref: DocumentReference) => Promise<DocumentSnapshot> }
): Promise<PurchaseOrder> {
  const ref = deps?.ref ?? doc(db, "users", userId, COLLECTION, input.id);
  const read = deps?.read ?? getDoc;
  const generationAtStart = currentAuthMutationGeneration();
  let lastIssued: unknown = null;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    if (currentAuthMutationGeneration() !== generationAtStart) {
      throw new AppError("permission_denied", "Sign in again.", undefined, { reason: "session_changed" });
    }
    const snap = await read(ref);
    if (!snap.exists()) throw new AppError("not_found", "Purchase order not found.");
    const existingRaw = snap.data() as Record<string, unknown>;
    const existing = await materializePo(snap.id, existingRaw, userId);
    const now = nextContentRevision(existing.updatedAt, Date.now());
    const items = input.items ?? existing.items;
    const next: PurchaseOrder = {
      ...existing,
      vendorName: input.vendorName?.trim() ?? existing.vendorName,
      vendorGstin: input.vendorGstin === undefined ? existing.vendorGstin : input.vendorGstin,
      vendorAddress: input.vendorAddress === undefined ? existing.vendorAddress : input.vendorAddress,
      vendorPin: input.vendorPin === undefined ? existing.vendorPin : input.vendorPin,
      vendorState: input.vendorState === undefined ? existing.vendorState : input.vendorState,
      vendorContactName: input.vendorContactName === undefined ? existing.vendorContactName : input.vendorContactName,
      vendorContactPhone: input.vendorContactPhone === undefined ? existing.vendorContactPhone : input.vendorContactPhone,
      vendorContactEmail: input.vendorContactEmail === undefined ? existing.vendorContactEmail : input.vendorContactEmail,
      buyerName: input.buyerName?.trim() ?? existing.buyerName,
      buyerAddress: input.buyerAddress === undefined ? existing.buyerAddress : input.buyerAddress,
      buyerGstin: input.buyerGstin === undefined ? existing.buyerGstin : input.buyerGstin,
      buyerPin: input.buyerPin === undefined ? existing.buyerPin : input.buyerPin,
      buyerState: input.buyerState === undefined ? existing.buyerState : input.buyerState,
      authorizedBy: input.authorizedBy === undefined ? existing.authorizedBy : input.authorizedBy,
      authorizedDesignation: input.authorizedDesignation === undefined ? existing.authorizedDesignation : input.authorizedDesignation,
      shipSameAsBuyer: input.shipSameAsBuyer === undefined ? existing.shipSameAsBuyer ?? false : input.shipSameAsBuyer,
      shipName: input.shipName === undefined ? existing.shipName : input.shipName,
      shipAddress: input.shipAddress === undefined ? existing.shipAddress : input.shipAddress,
      shipPin: input.shipPin === undefined ? existing.shipPin : input.shipPin,
      shipState: input.shipState === undefined ? existing.shipState : input.shipState,
      shipContact: input.shipContact === undefined ? existing.shipContact : input.shipContact,
      deliveryLocation: input.deliveryLocation === undefined ? existing.deliveryLocation : input.deliveryLocation,
      billingLocation: input.billingLocation === undefined ? existing.billingLocation : input.billingLocation,
      expectedDeliveryDate: input.expectedDeliveryDate === undefined ? existing.expectedDeliveryDate : input.expectedDeliveryDate,
      taxApplicable: input.taxApplicable === undefined ? existing.taxApplicable : input.taxApplicable,
      gstRate: input.gstRate === undefined ? existing.gstRate : input.gstRate,
      useLogo: input.useLogo === undefined ? existing.useLogo : input.useLogo,
      items,
      total: input.total ?? computePurchaseOrderTotal(items),
      deliveryTerms: input.deliveryTerms === undefined ? existing.deliveryTerms : input.deliveryTerms,
      paymentTerms: input.paymentTerms === undefined ? existing.paymentTerms : input.paymentTerms,
      freightTerms: input.freightTerms === undefined ? existing.freightTerms : input.freightTerms,
      referenceNumber: input.referenceNumber === undefined ? existing.referenceNumber : input.referenceNumber,
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
    try {
      await commitPo(db, ref, userId, next, existingRaw, generationAtStart);
      return next;
    } catch (error) {
      if (error instanceof RevisionConflict) {
        lastIssued = null;
        continue;
      }
      const settled = await settleIssuedWrite({
        error,
        generationAtStart,
        currentGeneration: currentAuthMutationGeneration,
        inspect: async () => {
          const again = await read(ref);
          if (again.metadata?.fromCache === true) return { state: "cached" };
          if (!again.exists()) return { state: "deleted" };
          const againRaw = again.data() as Record<string, unknown>;
          const opened = await materializePo(again.id, againRaw, userId);
          return {
            state: "server",
            revisionMoved: Number(againRaw.updatedAt) !== Number(existingRaw.updatedAt),
            operationPresent: purchaseOrderEffectPresent(opened, next, "edit"),
            current: opened,
          };
        },
      });
      if (settled.action === "missing") throw new AppError("not_found", "Purchase order not found.");
      if (settled.action === "return" && settled.current) return settled.current;
      lastIssued = error;
    }
  }
  if (lastIssued) throw lastIssued;
  throw new AppError("save_failed", "This purchase order changed on another device. Try again.", undefined, {
    reason: "revision_conflict",
  });
}

export async function cancelPurchaseOrderOnDb(
  db: Firestore,
  userId: string,
  id: string,
  deps?: { ref?: DocumentReference; read?: (ref: DocumentReference) => Promise<DocumentSnapshot> }
): Promise<PurchaseOrder> {
  const ref = deps?.ref ?? doc(db, "users", userId, COLLECTION, id);
  const read = deps?.read ?? getDoc;
  const generationAtStart = currentAuthMutationGeneration();
  let lastIssued: unknown = null;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    if (currentAuthMutationGeneration() !== generationAtStart) {
      throw new AppError("permission_denied", "Sign in again.", undefined, { reason: "session_changed" });
    }
    const snap = await read(ref);
    if (!snap.exists()) throw new AppError("not_found", "Purchase order not found.");
    const existingRaw = snap.data() as Record<string, unknown>;
    const existing = await materializePo(snap.id, existingRaw, userId);
    const now = nextContentRevision(existing.updatedAt, Date.now());
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
    try {
      await commitPo(db, ref, userId, next, existingRaw, generationAtStart);
      return next;
    } catch (error) {
      if (error instanceof RevisionConflict) {
        lastIssued = null;
        continue;
      }
      const settled = await settleIssuedWrite({
        error,
        generationAtStart,
        currentGeneration: currentAuthMutationGeneration,
        inspect: async () => {
          const again = await read(ref);
          if (again.metadata?.fromCache === true) return { state: "cached" };
          if (!again.exists()) return { state: "deleted" };
          const againRaw = again.data() as Record<string, unknown>;
          const opened = await materializePo(again.id, againRaw, userId);
          return {
            state: "server",
            revisionMoved: Number(againRaw.updatedAt) !== Number(existingRaw.updatedAt),
            operationPresent: purchaseOrderEffectPresent(opened, next, "cancel"),
            current: opened,
          };
        },
      });
      if (settled.action === "missing") throw new AppError("not_found", "Purchase order not found.");
      if (settled.action === "return" && settled.current) return settled.current;
      lastIssued = error;
    }
  }
  if (lastIssued) throw lastIssued;
  throw new AppError("save_failed", "This purchase order changed on another device. Try again.", undefined, {
    reason: "revision_conflict",
  });
}

export const firebasePurchaseOrderRepository: PurchaseOrderRepository = {
  async allocateSerial(userId) {
    return allocatePurchaseOrderSerialOnDb(getFirebaseDb(), userId);
  },

  async create(userId, input) {
    const record = await createPurchaseOrderAtomic(getFirebaseDb(), userId, input, (id, data) =>
      fromDoc(id, data, userId),
      { prepareCloudPayload: prepareBusinessCreate("purchaseOrders", userId) }
    );
    return settleCreatedBusinessCloud({
      collection: "purchaseOrders",
      userId,
      record,
      readRaw: async () => {
        const snap = await getDoc(poDocRef(userId, record.id));
        return snap.exists() ? (snap.data() as Record<string, unknown>) : null;
      },
      writeCloud: async (cloud) => {
        await setDoc(poDocRef(userId, record.id), cloud, { merge: true });
      },
    });
  },

  async update(userId, input) {
    return updatePurchaseOrderOnDb(getFirebaseDb(), userId, input);
  },

  async cancel(userId, id) {
    return cancelPurchaseOrderOnDb(getFirebaseDb(), userId, id);
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
    return materializePo(snap.id, snap.data() as Record<string, unknown>, userId);
  },

  async list(userId, options = {}) {
    if (!userId) return [];
    const snap = await getDocs(query(userCollection(userId), orderBy("serial", "desc")));
    let out = await Promise.all(
      snap.docs.map((d) => materializePo(d.id, d.data() as Record<string, unknown>, userId))
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
