import { doc, getDoc, setDoc, type Firestore } from "firebase/firestore";

import { AppError } from "@/domain/errors";
import type { CustomerCreditRecord } from "@/domain/customerCredit";
import { appendPayment, applyFullClosure } from "./shared";
import type { AddCreditPaymentInput, CloseFullyPaidInput } from "./types";

function toCloud(record: CustomerCreditRecord): Record<string, unknown> {
  const { pdfUri: _pdf, customerPhoto: _photo, closure, ...rest } = record;
  const closureCloud = closure ? { ...closure, paymentProofUri: null } : null;
  return { ...rest, pdfUri: null, customerPhoto: null, closure: closureCloud };
}

function recordRef(db: Firestore, userId: string, recordId: string) {
  return doc(db, "users", userId, "customerCreditRecords", recordId);
}

/**
 * Firestore payment append used by the production Customer Credit repository.
 * Parameterised with `db` so emulator tests can exercise the same write path
 * without loading the React Native firebase app singleton.
 */
export async function addCustomerCreditPaymentOnDb(
  db: Firestore,
  userId: string,
  recordId: string,
  payment: AddCreditPaymentInput,
  parseExisting: (id: string, data: Record<string, unknown>) => CustomerCreditRecord,
  nowMs = Date.now()
): Promise<CustomerCreditRecord> {
  if (!userId) throw new AppError("permission_denied", "Not signed in.");
  const ref = recordRef(db, userId, recordId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new AppError("not_found", "Record not found.");
  const existing = parseExisting(snap.id, snap.data() as Record<string, unknown>);
  const next = appendPayment(existing, payment, nowMs);
  await setDoc(ref, toCloud(next), { merge: true });
  return next;
}

/** Firestore full-closure write used by the production Customer Credit repository. */
export async function closeCustomerCreditFullyPaidOnDb(
  db: Firestore,
  userId: string,
  input: CloseFullyPaidInput,
  parseExisting: (id: string, data: Record<string, unknown>) => CustomerCreditRecord,
  nowMs = Date.now()
): Promise<CustomerCreditRecord> {
  if (!userId) throw new AppError("permission_denied", "Not signed in.");
  const ref = recordRef(db, userId, input.recordId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new AppError("not_found", "Record not found.");
  const existing = parseExisting(snap.id, snap.data() as Record<string, unknown>);
  const next = applyFullClosure(
    existing,
    input.closure,
    {
      appendPayment: input.appendFinalPayment !== false,
      clientPaymentId: input.clientMutationId,
    },
    nowMs
  );
  await setDoc(ref, toCloud(next), { merge: true });
  return next;
}
