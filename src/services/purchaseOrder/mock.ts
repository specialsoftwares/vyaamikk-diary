/**
 * AsyncStorage-backed Purchase Order repository (local-mock mode).
 *
 * Layout:
 *   vyd_po_v1_<userId>        → JSON array of PurchaseOrder
 *   vyd_po_serial_v1_<userId> → highest serial ever allocated (monotonic)
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

import { AppError } from "@/domain/errors";
import {
  computePurchaseOrderTotal,
  formatPoNumber,
  type PurchaseOrder,
} from "@/domain/purchaseOrder";
import { stableRecordId } from "@/services/records/stableRecordId";
import { createLogger } from "@/utils/logger";

import type {
  CreatePurchaseOrderInput,
  ListPurchaseOrdersOptions,
  PurchaseOrderRepository,
  UpdatePurchaseOrderInput,
} from "./types";

const log = createLogger("purchaseOrder/mock");
const KEY_PREFIX = "vyd_po_v1_";
const SERIAL_PREFIX = "vyd_po_serial_v1_";

function keyFor(userId: string): string {
  return `${KEY_PREFIX}${userId}`;
}
function serialKeyFor(userId: string): string {
  return `${SERIAL_PREFIX}${userId}`;
}

async function loadAll(userId: string): Promise<PurchaseOrder[]> {
  if (!userId) return [];
  const raw = await AsyncStorage.getItem(keyFor(userId));
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? (arr as PurchaseOrder[]) : [];
  } catch {
    return [];
  }
}

async function persist(userId: string, items: PurchaseOrder[]): Promise<void> {
  await AsyncStorage.setItem(keyFor(userId), JSON.stringify(items));
}

async function maxExistingSerial(userId: string): Promise<number> {
  const all = await loadAll(userId);
  return all.reduce((m, p) => Math.max(m, p.serial ?? 0), 0);
}

function applyFilters(
  items: PurchaseOrder[],
  opts: ListPurchaseOrdersOptions
): PurchaseOrder[] {
  let out = items;
  if (!opts.includeDeleted) out = out.filter((p) => !p.deletedAt);
  if (opts.search?.trim()) {
    const needle = opts.search.trim().toLowerCase();
    out = out.filter((p) =>
      [p.poNumber, p.vendorName, p.referenceNumber ?? "", p.notes ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(needle)
    );
  }
  out = [...out].sort((a, b) => b.serial - a.serial);
  if (opts.limit && opts.limit > 0) out = out.slice(0, opts.limit);
  return out;
}

export const mockPurchaseOrderRepository: PurchaseOrderRepository = {
  async allocateSerial(userId) {
    if (!userId) throw new AppError("permission_denied", "Not signed in.");
    const stored = Number((await AsyncStorage.getItem(serialKeyFor(userId))) ?? 0);
    const counter = Number.isFinite(stored) ? stored : 0;
    const next = Math.max(counter, await maxExistingSerial(userId)) + 1;
    await AsyncStorage.setItem(serialKeyFor(userId), String(next));
    return next;
  },

  async create(userId, input) {
    if (!userId) throw new AppError("permission_denied", "Not signed in.");
    const id = stableRecordId(input.clientRecordId, "po");
    const all = await loadAll(userId);
    const hit = all.find((p) => p.id === id);
    if (hit) return hit;

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
    all.unshift(po);
    await persist(userId, all);
    log.info("po created");
    return po;
  },

  async update(userId, input) {
    const all = await loadAll(userId);
    const idx = all.findIndex((p) => p.id === input.id);
    if (idx === -1) throw new AppError("not_found", "Purchase order not found.");
    const existing = all[idx];
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
        input.shipSameAsBuyer === undefined ? existing.shipSameAsBuyer : input.shipSameAsBuyer,
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
    all[idx] = next;
    await persist(userId, all);
    return next;
  },

  async cancel(userId, id) {
    const all = await loadAll(userId);
    const idx = all.findIndex((p) => p.id === id);
    if (idx === -1) throw new AppError("not_found", "Purchase order not found.");
    const existing = all[idx];
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
    all[idx] = next;
    await persist(userId, all);
    return next;
  },

  async remove(userId, id) {
    const all = await loadAll(userId);
    await persist(
      userId,
      all.filter((p) => p.id !== id)
    );
    log.info("po removed");
  },

  async getById(userId, id) {
    const all = await loadAll(userId);
    return all.find((p) => p.id === id && !p.deletedAt) ?? null;
  },

  async list(userId, options = {}) {
    return applyFilters(await loadAll(userId), options);
  },
};
