/**
 * Distinguish a restored OTP screen, a fresh Firebase verification, and an
 * explicit resend. The locked Android RNFirebase adapter uses a 60-second
 * verification window and sends again inside that window only when
 * forceResend is true and a force-resending token exists.
 */

import { remainingSecondsUntil } from "@/utils/otpCountdownFormat";

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

/** The timestamp both the OTP screen and the resend handler must use. */
export function sharedPhoneResendDeadline(
  stored: number | null | undefined,
  now: number
): number {
  if (typeof stored === "number" && Number.isFinite(stored)) return stored;
  return now + MOBILE_OTP_RESEND_COOLDOWN_MS;
}

export type PresentedPhoneResend = {
  showCountdown: boolean;
  remainingSeconds: number;
  invoke: boolean;
  forceResend: boolean;
  resendAvailableAt: number | null;
};

/**
 * One resend decision for the control and the handler.
 * A missing deadline is not presented as a send, and a tap does not invent a new one.
 */
export function presentedPhoneResend(input: {
  resendAvailableAt: number | null;
  now: number;
  resending?: boolean;
  loading?: boolean;
}): PresentedPhoneResend {
  const until = input.resendAvailableAt;
  if (typeof until !== "number" || !Number.isFinite(until)) {
    return {
      showCountdown: false,
      remainingSeconds: 0,
      invoke: false,
      forceResend: false,
      resendAvailableAt: null,
    };
  }
  const remainingSeconds = remainingSecondsUntil(until, input.now);
  if (input.resending || input.loading || remainingSeconds > 0) {
    return {
      showCountdown: remainingSeconds > 0,
      remainingSeconds,
      invoke: false,
      forceResend: false,
      resendAvailableAt: until,
    };
  }
  const plan = planPhoneVerification({
    intent: "explicit_resend",
    now: input.now,
    resendAvailableAt: until,
  });
  if (plan.action === "send" && plan.forceResend) {
    return {
      showCountdown: false,
      remainingSeconds: 0,
      invoke: true,
      forceResend: true,
      resendAvailableAt: until,
    };
  }
  return {
    showCountdown: true,
    remainingSeconds,
    invoke: false,
    forceResend: false,
    resendAvailableAt: until,
  };
}
