import AsyncStorage from "@react-native-async-storage/async-storage";

import type { CashDenominationBreakdown } from "@/domain/businessEntry";
import { AppError } from "@/domain/errors";
import { getFinancialYearForDate } from "@/utils/financialYear";

const COUNTER_PREFIX = "vyd_cpv_serial_v1_";

export interface CashPaidVoucherSerialResult {
  serial: string;
  yearLabel: string;
  allocatedAt: number;
}

/** e.g. 2026-03-15 → "2025-26"; 2026-04-01 → "2026-27" */
export function formatCashPaidFinancialYearLabel(dateMs: number): string {
  const fyStart = getFinancialYearForDate(dateMs);
  const endShort = String(fyStart + 1).slice(-2);
  return `${fyStart}-${endShort}`;
}

export function formatCpvSerial(yearLabel: string, count: number): string {
  const padded = String(Math.max(1, Math.floor(count))).padStart(4, "0");
  return `CPV/${yearLabel}/${padded}`;
}

export function parseCpvSerial(serial: string): { yearLabel: string; count: number } | null {
  const match = /^CPV\/(\d{4}-\d{2})\/(\d+)$/.exec(serial.trim());
  if (!match) return null;
  return { yearLabel: match[1], count: Number(match[2]) };
}

function counterKey(userId: string): string {
  return `${COUNTER_PREFIX}${userId}`;
}

interface StoredCounter {
  currentYear: string;
  count: number;
}

async function readCounter(userId: string): Promise<StoredCounter | null> {
  const raw = await AsyncStorage.getItem(counterKey(userId));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StoredCounter;
    if (typeof parsed.currentYear === "string" && Number.isFinite(parsed.count)) {
      return parsed;
    }
  } catch {
    /* ignore */
  }
  return null;
}

async function writeCounter(userId: string, counter: StoredCounter): Promise<void> {
  await AsyncStorage.setItem(counterKey(userId), JSON.stringify(counter));
}

export function denominationTotal(breakdown: CashDenominationBreakdown): number {
  return (
    breakdown[500] * 500 +
    breakdown[200] * 200 +
    breakdown[100] * 100 +
    breakdown[50] * 50
  );
}

export function validateDenominationForFullLegal(
  amount: number,
  breakdown: CashDenominationBreakdown | null | undefined
): string | null {
  if (!breakdown) {
    return "Enter a denomination breakdown before exporting a Full Legal Record PDF.";
  }
  const computed = denominationTotal(breakdown);
  if (computed !== amount) {
    return "Denomination note total must match the cash amount.";
  }
  if (breakdown.total !== computed) {
    return "Denomination total must match the note counts.";
  }
  return null;
}

/** Local-mock serial allocation with FY rollover. */
export async function mockAllocateCashPaidVoucherSerial(
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

  const stored = await readCounter(userId);
  const nextCount = stored?.currentYear === yearLabel ? stored.count + 1 : 1;
  await writeCounter(userId, { currentYear: yearLabel, count: nextCount });
  const allocatedAt = Date.now();
  return {
    serial: formatCpvSerial(yearLabel, nextCount),
    yearLabel,
    allocatedAt,
  };
}
