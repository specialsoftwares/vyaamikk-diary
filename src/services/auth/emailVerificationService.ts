/**
 * Email verification integration seam.
 *
 * Production uses Cloud Functions (`startEmailVerification`). Until an email
 * delivery provider is wired server-side, emails remain `unverified`.
 */

import { getActiveBackend } from "@/config/env";
import type { UserProfile } from "@/domain/types";

export interface EmailVerificationRequestResult {
  sent: boolean;
  verificationId?: string;
  message?: string;
}

/** True when server-side verification flow is callable (production Firebase). */
export function isEmailVerificationAvailable(): boolean {
  return getActiveBackend() === "firebase-production";
}

export async function requestEmailVerification(
  user: UserProfile
): Promise<EmailVerificationRequestResult> {
  const email = user.businessEmail?.trim();
  if (!email || getActiveBackend() !== "firebase-production") {
    return { sent: false };
  }
  const { callStartEmailVerification } = await import("./identityCallable");
  const result = await callStartEmailVerification(email);
  return {
    sent: result.sent,
    verificationId: result.verificationId,
    message: result.message,
  };
}
