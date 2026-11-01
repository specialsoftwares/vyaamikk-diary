/**
 * Distinguish a restored OTP screen, a fresh Firebase verification, and an
 * explicit resend. The locked Android RNFirebase adapter uses a 60-second
 * verification window and sends again inside that window only when
 * forceResend is true and a force-resending token exists.
 */

import { MOBILE_OTP_RESEND_COOLDOWN_MS } from "./mobileOtpConstants";

export const ANDROID_PHONE_VERIFICATION_TIMEOUT_SECONDS = 60;

export type PhoneVerificationIntent = "restore" | "fresh" | "explicit_resend";

export type PhoneVerificationPlan =
  | { action: "restore_without_send" }
  | { action: "send"; forceResend: false }
  | { action: "send"; forceResend: true }
  | { action: "cooldown"; resendAvailableAt: number };

export function planPhoneVerification(input: {
  intent: PhoneVerificationIntent;
  now: number;
  resendAvailableAt?: number | null;
}): PhoneVerificationPlan {
  if (input.intent === "restore") return { action: "restore_without_send" };
  if (input.intent === "fresh") return { action: "send", forceResend: false };
  const until = input.resendAvailableAt;
  if (typeof until !== "number" || !Number.isFinite(until)) {
    return { action: "cooldown", resendAvailableAt: input.now + MOBILE_OTP_RESEND_COOLDOWN_MS };
  }
  if (until > input.now) return { action: "cooldown", resendAvailableAt: until };
  return { action: "send", forceResend: true };
}
