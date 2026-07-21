/**
 * Production business-email binding via Cloud Functions / guarded local-mock OTP.
 * Clients never mark emailVerified themselves.
 */

import type { UserProfile } from "@/domain/types";
import {
  completeEmailOtpVerification,
  requiresServerEmailBinding as requiresTrustedEmailBackend,
  startEmailOtpVerification,
} from "./emailVerificationService";

export function requiresServerEmailBinding(): boolean {
  return requiresTrustedEmailBackend();
}

export async function startBusinessEmailVerification(
  uid: string,
  rawEmail: string
): Promise<{ verificationId: string; devCodeHint?: string; resendAvailableAt?: number }> {
  const result = await startEmailOtpVerification(uid, rawEmail);
  return {
    verificationId: result.challengeId,
    devCodeHint: result.devCodeHint,
    resendAvailableAt: result.resendAvailableAt,
  };
}

export async function completeBusinessEmailBind(
  uid: string,
  verificationId: string,
  code: string,
  applyLocalProfile: (patch: Partial<UserProfile>) => Promise<UserProfile>
): Promise<UserProfile> {
  return completeEmailOtpVerification(uid, verificationId, code, applyLocalProfile);
}
