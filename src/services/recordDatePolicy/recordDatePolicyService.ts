import { addMonths, subDays, addDays } from "date-fns";

import type { BusinessEntryType } from "@/domain/businessEntry";
import {
  calendarDayStartMs,
  normalizeRecordDayMs,
  ONE_DAY_MS,
} from "./calendar";

/** Policy identifiers — one rule set per business date role. */
export type RecordDatePolicyId =
  | "cash_paid"
  | "payment_request_created"
  | "event_past_15"
  | "material_receipt_7d"
  | "freight_event"
  | "supporting_past_optional"
  | "reminder_future_3m";

export type RecordDatePolicyErrorCode =
  | "required"
  | "future"
  | "too_old"
  | "too_far_future"
  | "not_today";

const CASH_LOOKBACK_DAYS = 30;
const EVENT_LOOKBACK_DAYS = 15;
const MATERIAL_RECEIPT_WINDOW_DAYS = 7;
const FREIGHT_WINDOW_DAYS = 15;
const REMINDER_FORWARD_MONTHS = 3;

export interface RecordDatePolicyValidateOptions {
  /** When editing, unchanged calendar day passes even if outside current window. */
  existingMs?: number | null;
  /** Record entry anchor for receipt-date windows (defaults to today). */
  recordEntryAnchorMs?: number | null;
}

export interface RecordDatePickerBounds {
  minimumDate: Date;
  maximumDate: Date;
}

function isUnchangedDay(ms: number, existingMs?: number | null): boolean {
  if (existingMs == null || existingMs <= 0) return false;
  return calendarDayStartMs(new Date(ms)) === calendarDayStartMs(new Date(existingMs));
}

function validateWindow(
  dayMs: number,
  minMs: number,
  maxMs: number,
  options?: RecordDatePolicyValidateOptions
): RecordDatePolicyErrorCode | null {
  if (options?.existingMs != null && isUnchangedDay(dayMs, options.existingMs)) {
    return null;
  }
  if (dayMs < minMs) return "too_old";
  if (dayMs > maxMs) return "future";
  return null;
}

export function validateRecordDate(
  policyId: RecordDatePolicyId,
  ms: number | null | undefined,
  options?: RecordDatePolicyValidateOptions,
  reference: Date = new Date()
): RecordDatePolicyErrorCode | null {
  if (ms == null || !Number.isFinite(ms) || ms <= 0) return "required";

  const day = calendarDayStartMs(new Date(ms));
  const today = calendarDayStartMs(reference);

  switch (policyId) {
    case "cash_paid": {
      const min = calendarDayStartMs(subDays(reference, CASH_LOOKBACK_DAYS));
      const err = validateWindow(day, min, today, options);
      if (err === "future") return "future";
      if (err === "too_old") return "too_old";
      return null;
    }
    case "payment_request_created": {
      if (options?.existingMs != null && isUnchangedDay(day, options.existingMs)) {
        return null;
      }
      if (day !== today) return "not_today";
      return null;
    }
    case "event_past_15": {
      const min = calendarDayStartMs(subDays(reference, EVENT_LOOKBACK_DAYS));
      return validateWindow(day, min, today, options);
    }
    case "material_receipt_7d": {
      const anchor = calendarDayStartMs(
        new Date(options?.recordEntryAnchorMs ?? reference)
      );
      const min = calendarDayStartMs(subDays(new Date(anchor), MATERIAL_RECEIPT_WINDOW_DAYS));
      const max = calendarDayStartMs(addDays(new Date(anchor), MATERIAL_RECEIPT_WINDOW_DAYS));
      const err = validateWindow(day, min, max, options);
      if (err === "future" || err === "too_old") return err;
      return null;
    }
    case "freight_event": {
      const min = calendarDayStartMs(subDays(reference, FREIGHT_WINDOW_DAYS));
      const max = calendarDayStartMs(subDays(reference, -FREIGHT_WINDOW_DAYS));
      return validateWindow(day, min, max, options);
    }
    case "supporting_past_optional": {
      if (options?.existingMs != null && isUnchangedDay(day, options.existingMs)) {
        return null;
      }
      if (day > today) return "future";
      return null;
    }
    case "reminder_future_3m": {
      const max = calendarDayStartMs(
        addMonths(reference, REMINDER_FORWARD_MONTHS)
      );
      if (options?.existingMs != null && isUnchangedDay(day, options.existingMs)) {
        return null;
      }
      if (day < today) return "too_old";
      if (day > max) return "too_far_future";
      return null;
    }
    default:
      return null;
  }
}

export function getRecordDatePickerBounds(
  policyId: RecordDatePolicyId,
  reference: Date = new Date(),
  options?: Pick<RecordDatePolicyValidateOptions, "recordEntryAnchorMs">
): RecordDatePickerBounds | null {
  const today = calendarDayStartMs(reference);

  switch (policyId) {
    case "cash_paid":
      return {
        minimumDate: new Date(calendarDayStartMs(subDays(reference, CASH_LOOKBACK_DAYS))),
        maximumDate: new Date(today),
      };
    case "payment_request_created":
      return {
        minimumDate: new Date(today),
        maximumDate: new Date(today),
      };
    case "event_past_15":
      return {
        minimumDate: new Date(calendarDayStartMs(subDays(reference, EVENT_LOOKBACK_DAYS))),
        maximumDate: new Date(today),
      };
    case "material_receipt_7d": {
      const anchor = calendarDayStartMs(
        new Date(options?.recordEntryAnchorMs ?? reference)
      );
      return {
        minimumDate: new Date(
          calendarDayStartMs(subDays(new Date(anchor), MATERIAL_RECEIPT_WINDOW_DAYS))
        ),
        maximumDate: new Date(
          calendarDayStartMs(addDays(new Date(anchor), MATERIAL_RECEIPT_WINDOW_DAYS))
        ),
      };
    }
    case "freight_event":
      return {
        minimumDate: new Date(calendarDayStartMs(subDays(reference, FREIGHT_WINDOW_DAYS))),
        maximumDate: new Date(calendarDayStartMs(subDays(reference, -FREIGHT_WINDOW_DAYS))),
      };
    case "supporting_past_optional":
      return {
        minimumDate: new Date(calendarDayStartMs(subDays(reference, 3650))),
        maximumDate: new Date(today),
      };
    case "reminder_future_3m":
      return {
        minimumDate: new Date(today),
        maximumDate: new Date(calendarDayStartMs(addMonths(reference, REMINDER_FORWARD_MONTHS))),
      };
    default:
      return null;
  }
}

/** i18n key under `datePolicy.errors.{policyId}.{code}` */
export function recordDatePolicyMessageKey(
  policyId: RecordDatePolicyId,
  code: RecordDatePolicyErrorCode
): string {
  return `datePolicy.errors.${policyId}.${code}`;
}

/** Map entry type + form field to policy. */
export function policyForField(
  entryType: BusinessEntryType,
  field: string
): RecordDatePolicyId | null {
  switch (entryType) {
    case "business_cash_given":
      if (field === "paymentDate") return "cash_paid";
      return null;
    case "payment_request":
      if (field === "entryDate") return "payment_request_created";
      if (field === "invoiceDate" || field === "dueDate") return "supporting_past_optional";
      return null;
    case "work_update_issue":
    case "staff_matter":
      if (field === "entryDate") return "event_past_15";
      return null;
    case "material_dispatched":
    case "material_return":
      if (field === "entryDate") return "event_past_15";
      return null;
    case "material_received":
      if (field === "entryDate") return "material_receipt_7d";
      return null;
    case "outward_freight_details":
      if (field === "billDate" || field === "entryDate") return "freight_event";
      return null;
    case "reminder_purchase":
    case "reminder_email":
      if (field === "reminder") return "reminder_future_3m";
      return null;
    default:
      return null;
  }
}

/** App-maintained request date for new payment requests. */
export function paymentRequestCreatedDateMs(reference: Date = new Date()): number {
  return normalizeRecordDayMs(calendarDayStartMs(reference));
}

export { CASH_LOOKBACK_DAYS, EVENT_LOOKBACK_DAYS, MATERIAL_RECEIPT_WINDOW_DAYS, FREIGHT_WINDOW_DAYS, REMINDER_FORWARD_MONTHS };
