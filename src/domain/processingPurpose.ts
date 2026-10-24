/**
 * Required service processing is not a consent checkbox.
 * Crash diagnostics are the optional purpose and reuse the telemetry switch.
 */

export const REQUIRED_PROCESSING_PURPOSE = "service_operation";
export const CRASH_DIAGNOSTICS_PURPOSE = "crash_diagnostics";

export const OPTIONAL_PROCESSING_PURPOSES = [CRASH_DIAGNOSTICS_PURPOSE] as const;

export type ProcessingPurpose = typeof REQUIRED_PROCESSING_PURPOSE | typeof CRASH_DIAGNOSTICS_PURPOSE;

export function isOptionalPurpose(purpose: string): boolean {
  return (OPTIONAL_PROCESSING_PURPOSES as readonly string[]).includes(purpose);
}

export function withdrawalEffect(purpose: string): {
  stopsPurposeProcessing: boolean;
  deletesAccount: boolean;
} {
  if (purpose === CRASH_DIAGNOSTICS_PURPOSE) {
    return { stopsPurposeProcessing: true, deletesAccount: false };
  }
  if (purpose === REQUIRED_PROCESSING_PURPOSE) {
    return { stopsPurposeProcessing: false, deletesAccount: false };
  }
  throw new Error("unknown_purpose");
}

export function consentAppliesToAccount(
  record: { uid: string; purpose: string },
  uid: string,
  purpose: string
): boolean {
  return record.uid === uid && record.purpose === purpose;
}
