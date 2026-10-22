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
import { writeTelemetryConsent } from "@/services/telemetry/telemetryConsent";

export async function withdrawProcessingPurpose(purpose: string): Promise<{
  stopsPurposeProcessing: boolean;
  deletesAccount: boolean;
}> {
  const effect = withdrawalEffect(purpose);
  if (purpose === CRASH_DIAGNOSTICS_PURPOSE && effect.stopsPurposeProcessing) {
    await writeTelemetryConsent(false);
  }
  return effect;
}

export function requiredProcessingIsNotOptional(): boolean {
  return withdrawalEffect(REQUIRED_PROCESSING_PURPOSE).stopsPurposeProcessing === false;
}

export { consentAppliesToAccount };
