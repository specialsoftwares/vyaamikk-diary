import { doc, runTransaction } from "firebase/firestore";

import { AppError } from "@/domain/errors";
import { getFirebaseDb } from "@/config/firebase";

import {
  formatCashPaidFinancialYearLabel,
  formatCpvSerial,
  parseCpvSerial,
  type CashPaidVoucherSerialResult,
} from "./cashPaidVoucherSerial";

function counterDocRef(userId: string) {
  return doc(getFirebaseDb(), "users", userId, "counters", "cashPaidVouchers");
}

function num(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export async function firebaseAllocateCashPaidVoucherSerial(
  userId: string,
  paymentDateMs: number,
  existingSerial?: string | null
): Promise<CashPaidVoucherSerialResult> {
  if (!userId) throw new AppError("permission_denied", "Not signed in.");
  const yearLabel = formatCashPaidFinancialYearLabel(paymentDateMs);
  const existing = existingSerial?.trim();
  if (existing) {
    const parsed = parseCpvSerial(existing);
    if (parsed?.yearLabel === yearLabel) {
      return { serial: existing, yearLabel, allocatedAt: Date.now() };
    }
  }

  const ref = counterDocRef(userId);
  return runTransaction(getFirebaseDb(), async (tx) => {
    const snap = await tx.get(ref);
    const raw = snap.exists() ? (snap.data() as Record<string, unknown>) : {};
    const storedYear = typeof raw.currentYear === "string" ? raw.currentYear : "";
    const storedCount = num(raw.count);
    const nextCount = storedYear === yearLabel ? storedCount + 1 : 1;
    tx.set(ref, { currentYear: yearLabel, count: nextCount, updatedAt: Date.now() }, { merge: true });
    return {
      serial: formatCpvSerial(yearLabel, nextCount),
      yearLabel,
      allocatedAt: Date.now(),
    };
  });
}
