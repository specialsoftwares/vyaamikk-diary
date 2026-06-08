import {
  CASH_LOOKBACK_DAYS,
  calendarDayStartMs,
  getRecordDatePickerBounds,
  normalizeRecordDayMs,
  validateRecordDate,
} from "@/services/recordDatePolicy";

/** Permitted lookback for new/edited cash paid dates (calendar days, local timezone). */
export const CASH_PAID_LOOKBACK_DAYS = CASH_LOOKBACK_DAYS;

export type CashPaidDateValidationCode = "required" | "future" | "too_old";

export { calendarDayStartMs };

export function normalizeCashPaidDayMs(ms: number): number {
  return normalizeRecordDayMs(ms);
}

export function cashPaidDateWindow(reference: Date = new Date()): {
  minMs: number;
  maxMs: number;
} {
  const bounds = getRecordDatePickerBounds("cash_paid", reference);
  if (!bounds) {
    const maxMs = calendarDayStartMs(reference);
    return { minMs: maxMs, maxMs };
  }
  return {
    minMs: bounds.minimumDate.getTime(),
    maxMs: bounds.maximumDate.getTime(),
  };
}

export function isCashPaidDateInWindow(ms: number, reference: Date = new Date()): boolean {
  return validateRecordDate("cash_paid", ms, undefined, reference) === null;
}

export function validateCashPaidDateForSave(
  ms: number | null | undefined,
  options?: { existingPaymentDateMs?: number | null }
): CashPaidDateValidationCode | null {
  const code = validateRecordDate("cash_paid", ms, {
    existingMs: options?.existingPaymentDateMs,
  });
  if (!code) return null;
  if (code === "not_today" || code === "too_far_future") return "future";
  return code;
}

export function cashPaidDatePickerDates(reference: Date = new Date()): {
  minimumDate: Date;
  maximumDate: Date;
} {
  const bounds = getRecordDatePickerBounds("cash_paid", reference);
  return bounds ?? {
    minimumDate: new Date(calendarDayStartMs(reference)),
    maximumDate: new Date(calendarDayStartMs(reference)),
  };
}
