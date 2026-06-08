/**
 * AsyncStorage-backed Customer Credit / EMI repository (local-mock mode).
 *
 * Layout:
 *   vyd_credit_v1_<userId>        → JSON array of CustomerCreditRecord
 *   vyd_credit_serial_v1_<userId> → highest serial ever allocated (monotonic)
 *
 * All data is strictly user-scoped. Sensitive values (mobile, document refs) are
 * never logged here.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

import { AppError } from "@/domain/errors";
import type { CustomerCreditRecord } from "@/domain/customerCredit";
import { createLogger } from "@/utils/logger";

import {
  appendPayment,
  applyFullClosure,
  applyStatus,
  applyUpdate,
  buildNewRecord,
  removePaymentFrom,
} from "./shared";
import type {
  CreateCustomerCreditInput,
  CustomerCreditRepository,
  ListCustomerCreditOptions,
  UpdateCustomerCreditInput,
} from "./types";

const log = createLogger("customerCredit/mock");
const KEY_PREFIX = "vyd_credit_v1_";
const SERIAL_PREFIX = "vyd_credit_serial_v1_";

function keyFor(userId: string): string {
  return `${KEY_PREFIX}${userId}`;
}
function serialKeyFor(userId: string): string {
  return `${SERIAL_PREFIX}${userId}`;
}

async function loadAll(userId: string): Promise<CustomerCreditRecord[]> {
  if (!userId) return [];
  const raw = await AsyncStorage.getItem(keyFor(userId));
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? (arr as CustomerCreditRecord[]) : [];
  } catch {
    return [];
  }
}

async function persist(userId: string, items: CustomerCreditRecord[]): Promise<void> {
  await AsyncStorage.setItem(keyFor(userId), JSON.stringify(items));
}

async function maxExistingSerial(userId: string): Promise<number> {
  const all = await loadAll(userId);
  return all.reduce((m, r) => Math.max(m, r.serial ?? 0), 0);
}

function applyFilters(
  items: CustomerCreditRecord[],
  opts: ListCustomerCreditOptions
): CustomerCreditRecord[] {
  let out = items;
  if (!opts.includeDeleted) out = out.filter((r) => !r.deletedAt);
  if (opts.search?.trim()) {
    const needle = opts.search.trim().toLowerCase();
    out = out.filter((r) =>
      [r.recordNumber, r.customerName, r.products[0]?.productName ?? "", r.remarks ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(needle)
    );
  }
  out = [...out].sort((a, b) => b.serial - a.serial);
  if (opts.limit && opts.limit > 0) out = out.slice(0, opts.limit);
  return out;
}

export const mockCustomerCreditRepository: CustomerCreditRepository = {
  async allocateSerial(userId) {
    if (!userId) throw new AppError("permission_denied", "Not signed in.");
    const stored = Number((await AsyncStorage.getItem(serialKeyFor(userId))) ?? 0);
    const counter = Number.isFinite(stored) ? stored : 0;
    const next = Math.max(counter, await maxExistingSerial(userId)) + 1;
    await AsyncStorage.setItem(serialKeyFor(userId), String(next));
    return next;
  },

  async create(userId, input: CreateCustomerCreditInput) {
    if (!userId) throw new AppError("permission_denied", "Not signed in.");
    const all = await loadAll(userId);
    const previewId = buildNewRecord(userId, 0, input, Date.now()).id;
    const hit = all.find((r) => r.id === previewId);
    if (hit) return hit;

    const serial = await this.allocateSerial(userId);
    const record = buildNewRecord(userId, serial, input, Date.now());
    all.unshift(record);
    await persist(userId, all);
    log.info("credit record created");
    return record;
  },

  async update(userId, input: UpdateCustomerCreditInput) {
    const all = await loadAll(userId);
    const idx = all.findIndex((r) => r.id === input.id);
    if (idx === -1) throw new AppError("not_found", "Record not found.");
    const next = applyUpdate(all[idx], input, Date.now());
    all[idx] = next;
    await persist(userId, all);
    return next;
  },

  async addPayment(userId, recordId, payment) {
    const all = await loadAll(userId);
    const idx = all.findIndex((r) => r.id === recordId);
    if (idx === -1) throw new AppError("not_found", "Record not found.");
    const next = appendPayment(all[idx], payment, Date.now());
    all[idx] = next;
    await persist(userId, all);
    return next;
  },

  async removePayment(userId, recordId, paymentId) {
    const all = await loadAll(userId);
    const idx = all.findIndex((r) => r.id === recordId);
    if (idx === -1) throw new AppError("not_found", "Record not found.");
    const next = removePaymentFrom(all[idx], paymentId, Date.now());
    all[idx] = next;
    await persist(userId, all);
    return next;
  },

  async setStatus(userId, recordId, status) {
    const all = await loadAll(userId);
    const idx = all.findIndex((r) => r.id === recordId);
    if (idx === -1) throw new AppError("not_found", "Record not found.");
    const next = applyStatus(all[idx], status, Date.now());
    all[idx] = next;
    await persist(userId, all);
    return next;
  },

  async closeFullyPaid(userId, input) {
    const all = await loadAll(userId);
    const idx = all.findIndex((r) => r.id === input.recordId);
    if (idx === -1) throw new AppError("not_found", "Record not found.");
    const next = applyFullClosure(
      all[idx],
      input.closure,
      {
        appendPayment: input.appendFinalPayment !== false,
        clientPaymentId: input.clientMutationId,
      },
      Date.now()
    );
    all[idx] = next;
    await persist(userId, all);
    return next;
  },

  async setReminder(userId, recordId, reminder) {
    const all = await loadAll(userId);
    const idx = all.findIndex((r) => r.id === recordId);
    if (idx === -1) throw new AppError("not_found", "Record not found.");
    const next: CustomerCreditRecord = {
      ...all[idx],
      reminderAt: reminder.reminderAt,
      reminderNotificationId: reminder.reminderNotificationId,
      updatedAt: Date.now(),
    };
    all[idx] = next;
    await persist(userId, all);
    return next;
  },

  async remove(userId, id) {
    const all = await loadAll(userId);
    await persist(
      userId,
      all.filter((r) => r.id !== id)
    );
    log.info("credit record removed");
  },

  async getById(userId, id) {
    const all = await loadAll(userId);
    return all.find((r) => r.id === id && !r.deletedAt) ?? null;
  },

  async list(userId, options = {}) {
    return applyFilters(await loadAll(userId), options);
  },
};
