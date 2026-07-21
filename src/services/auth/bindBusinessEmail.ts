/**
 * Production business-email binding via Cloud Functions / guarded local-mock OTP.
 * Clients never mark emailVerified themselves.
 */

import type { UserProfile } from "@/domain/types";
import {
  completeEmailOtpVerification,
  requiresServerEmailBinding as requiresTrustedEmailBackend,
  resendEmailOtpVerification,
  startEmailOtpVerification,
} from "./emailVerificationService";

export function requiresServerEmailBinding(): boolean {
  return requiresTrustedEmailBackend();
}

export async function startBusinessEmailVerification(
  uid: string,
  rawEmail: string
): Promise<{
  verificationId: string;
  devCodeHint?: string | null;
  resendAvailableAt?: number;
  expiresAt?: number;
}> {
  const result = await startEmailOtpVerification(uid, rawEmail);
  return {
    verificationId: result.challengeId,
    devCodeHint: result.devCodeHint,
    resendAvailableAt: result.resendAvailableAt,
    expiresAt: result.expiresAt,
  };
}

export async function resendBusinessEmailVerification(
  uid: string,
  challengeId: string,
  rawEmail: string
): Promise<{
  verificationId: string;
  devCodeHint?: string | null;
  resendAvailableAt?: number;
  expiresAt?: number;
}> {
  const result = await resendEmailOtpVerification(uid, challengeId, rawEmail);
  return {
    verificationId: result.challengeId,
    devCodeHint: result.devCodeHint,
    resendAvailableAt: result.resendAvailableAt,
    expiresAt: result.expiresAt,
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
