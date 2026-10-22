/**
 * Purpose withdrawal stops the optional processing it names.
 * It does not delete the account or required service records.
 */

import {
  CRASH_DIAGNOSTICS_PURPOSE,
  REQUIRED_PROCESSING_PURPOSE,
  consentAppliesToAccount,
  withdrawalEffect,
} from "@/domain/processingPurpose";
import {
  applyDiagnosticsChoice,
  type DiagnosticsPreference,
} from "@/services/telemetry/diagnosticsPreference";

export const PROCESSING_NOTICE_VERSION = "privacy-notice-2026-10";
export const PROCESSING_POLICY_VERSION = "processing-purpose-2026-10";

async function recordPurpose(purpose: "crash_diagnostics", decision: "grant" | "withdraw"): Promise<void> {
  try {
    const { callRecordProcessingPurpose } = await import("@/services/auth/identityCallable");
    await callRecordProcessingPurpose({
      purpose,
      decision,
      noticeVersion: PROCESSING_NOTICE_VERSION,
      policyVersion: PROCESSING_POLICY_VERSION,
    });
  } catch {
    // The local diagnostics gate has already moved. A missed receipt is retried
    // on the next choice and does not turn reporting back on.
  }
}

export async function chooseCrashDiagnostics(enabled: boolean): Promise<DiagnosticsPreference> {
  const pref = await applyDiagnosticsChoice(enabled);
  if (!enabled || pref.persisted) {
    await recordPurpose(CRASH_DIAGNOSTICS_PURPOSE, enabled ? "grant" : "withdraw");
  }
  return pref;
}

export async function withdrawProcessingPurpose(purpose: string): Promise<{
  stopsPurposeProcessing: boolean;
  deletesAccount: boolean;
}> {
  const effect = withdrawalEffect(purpose);
  if (purpose === CRASH_DIAGNOSTICS_PURPOSE && effect.stopsPurposeProcessing) {
    await applyDiagnosticsChoice(false);
    await recordPurpose(CRASH_DIAGNOSTICS_PURPOSE, "withdraw");
  }
  return effect;
}

export function requiredProcessingIsNotOptional(): boolean {
  return withdrawalEffect(REQUIRED_PROCESSING_PURPOSE).stopsPurposeProcessing === false;
}

export { consentAppliesToAccount };
