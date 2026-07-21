/**
 * Email verification integration — production callables + guarded local-mock.
 */

import { AppError } from "@/domain/errors";
import type { UserProfile } from "@/domain/types";
import { getActiveBackend } from "@/config/env";
import { isValidEmailSyntax, normalizeEmail } from "@/utils/emailHash";
import {
  callResendEmailVerification,
  callStartEmailVerification,
  callVerifyAndBindEmail,
  useIdentityCallables,
} from "./identityCallable";
import {
  isApprovedLocalMockEmailOtpEnvironment,
  localMockStartEmailOtp,
  localMockVerifyEmailOtp,
} from "./localMockEmailOtp";

export interface EmailVerificationStartResult {
  sent: boolean;
  challengeId: string;
  verificationId: string;
  maskedEmail?: string;
  expiresAt?: number;
  resendAvailableAt?: number;
  version?: number;
  message?: string;
  devCodeHint?: string;
}

/** True when a trusted email OTP path is available. */
export function isEmailVerificationAvailable(): boolean {
  if (useIdentityCallables()) return true;
  if (getActiveBackend() === "local-mock" && isApprovedLocalMockEmailOtpEnvironment()) {
    return true;
  }
  return false;
}

export function requiresServerEmailBinding(): boolean {
  return useIdentityCallables();
}

export async function startEmailOtpVerification(
  uid: string,
  rawEmail: string,
  opts?: { idempotencyKey?: string }
): Promise<EmailVerificationStartResult> {
  if (!isValidEmailSyntax(rawEmail)) {
    throw new AppError("save_failed", "Enter a valid email address.");
  }
  const normalized = normalizeEmail(rawEmail);

  if (useIdentityCallables()) {
    const result = await callStartEmailVerification(normalized, opts?.idempotencyKey);
    const id = result.challengeId ?? result.verificationId;
    if (!id) {
      throw new AppError("unknown", result.message ?? "Could not start email verification.");
    }
    return {
      sent: result.sent,
      challengeId: id,
      verificationId: id,
      maskedEmail: result.maskedEmail,
      expiresAt: result.expiresAt,
      resendAvailableAt: result.resendAvailableAt,
      version: result.version,
      message: result.message,
      devCodeHint: result.devCodeHint,
    };
  }

  if (getActiveBackend() === "local-mock") {
    const result = await localMockStartEmailOtp(uid, normalized);
    return {
      ...result,
      verificationId: result.challengeId,
    };
  }

  throw new AppError(
    "permission_denied",
    "Email verification requires the trusted backend. Configure Firebase Functions or approved local-mock OTP."
  );
}

export async function resendEmailOtpVerification(
  uid: string,
  challengeId: string,
  rawEmail: string
): Promise<EmailVerificationStartResult> {
  if (useIdentityCallables()) {
    const result = await callResendEmailVerification(challengeId);
    const id = result.challengeId ?? challengeId;
    return {
      sent: result.sent,
      challengeId: id,
      verificationId: id,
      maskedEmail: result.maskedEmail,
      expiresAt: result.expiresAt,
      resendAvailableAt: result.resendAvailableAt,
      version: result.version,
      devCodeHint: result.devCodeHint,
    };
  }
  return startEmailOtpVerification(uid, rawEmail);
}

export async function completeEmailOtpVerification(
  uid: string,
  challengeId: string,
  code: string,
  applyLocalProfile: (patch: Partial<UserProfile>) => Promise<UserProfile>
): Promise<UserProfile> {
  if (useIdentityCallables()) {
    return callVerifyAndBindEmail(challengeId, code);
  }
  if (getActiveBackend() === "local-mock") {
    return localMockVerifyEmailOtp(uid, challengeId, code, applyLocalProfile);
  }
  throw new AppError("permission_denied", "Email verification backend unavailable.");
}

/** @deprecated Prefer startEmailOtpVerification */
export async function requestEmailVerification(
  user: UserProfile
): Promise<{ sent: boolean; verificationId?: string; message?: string }> {
  const email = user.businessEmail?.trim();
  if (!email) return { sent: false };
  const result = await startEmailOtpVerification(user.uid, email);
  return {
    sent: result.sent,
    verificationId: result.verificationId,
    message: result.message,
  };
}
