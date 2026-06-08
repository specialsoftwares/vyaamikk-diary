import type { z } from "zod";

import {
  normalizeRecordDayMs,
  recordDatePolicyMessageKey,
  validateRecordDate,
  type RecordDatePolicyId,
  type RecordDatePolicyValidateOptions,
} from "@/services/recordDatePolicy";

export function refineRecordDatePolicy(
  policyId: RecordDatePolicyId,
  path: string | (string | number)[],
  ms: number | null | undefined,
  ctx: z.RefinementCtx,
  options?: RecordDatePolicyValidateOptions
): void {
  const code = validateRecordDate(policyId, ms, options);
  if (!code) return;
  const pathArr = Array.isArray(path) ? path : [path];
  ctx.addIssue({
    code: "custom",
    message: recordDatePolicyMessageKey(policyId, code),
    path: pathArr,
  });
}

export function normalizePolicyDateField(
  policyId: RecordDatePolicyId,
  ms: number
): number {
  if (policyId === "cash_paid" || policyId === "payment_request_created") {
    return normalizeRecordDayMs(ms);
  }
  if (
    policyId === "event_past_15" ||
    policyId === "freight_event" ||
    policyId === "reminder_future_3m"
  ) {
    return normalizeRecordDayMs(ms);
  }
  return normalizeRecordDayMs(ms);
}
