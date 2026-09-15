import type { Firestore } from "firebase/firestore";

import { AppError } from "@/domain/errors";
import type { CustomerCreditRecord } from "@/domain/customerCredit";
import { istMonthKeyForMillis } from "@/billing/istMonthKey";
import {
  allocateSerialCounter,
  runAtomicBillableCreate,
  type AtomicCreateHooks,
} from "@/billing/optionC/atomicBillableCreate";

import { stableRecordId } from "@/services/records/stableRecordId";

import { buildNewRecord } from "./shared";
import type { CreateCustomerCreditInput } from "./types";

function toCloud(record: CustomerCreditRecord): Record<string, unknown> {
  const { pdfUri: _pdf, customerPhoto: _photo, closure, ...rest } = record;
  const closureCloud = closure ? { ...closure, paymentProofUri: null } : null;
  return { ...rest, pdfUri: null, customerPhoto: null, closure: closureCloud };
}

export async function createCustomerCreditAtomic(
  db: Firestore,
  userId: string,
  input: CreateCustomerCreditInput,
  parseExisting: (id: string, data: Record<string, unknown>) => CustomerCreditRecord,
  hooks?: AtomicCreateHooks,
  nowMs = Date.now()
): Promise<CustomerCreditRecord> {
  if (!userId) throw new AppError("permission_denied", "Not signed in.");
  const recordId = stableRecordId(input.clientRecordId, "cr");
  const monthKey = istMonthKeyForMillis(nowMs);
  const result = await runAtomicBillableCreate({
    db,
    userId,
    collection: "customerCreditRecords",
    recordId,
    serialCounter: "customerCredit",
    nowMs,
    monthKey,
    parseExisting,
    buildNew: (serial) => {
      if (serial == null || serial < 1) {
        throw new AppError("save_failed", "Customer credit serial was not allocated.");
      }
      const record = buildNewRecord(userId, serial, input, nowMs);
      return { record, payload: toCloud(record) };
    },
    hooks,
  });
  return result.record;
}

export async function allocateCustomerCreditSerialOnDb(
  db: Firestore,
  userId: string
): Promise<number> {
  if (!userId) throw new AppError("permission_denied", "Not signed in.");
  return allocateSerialCounter(db, userId, "customerCredit");
}
