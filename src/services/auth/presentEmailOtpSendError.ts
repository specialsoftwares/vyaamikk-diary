/**
 * User-facing copy for email OTP send failures.
 * Never forwards Firebase / provider exception strings.
 */

import { AppError, classifyPublicError, PUBLIC_ERROR_COPY } from "@/domain/errors";

export const EMAIL_OTP_SEND_USER_COPY = {
  invalidEmail: "Please enter a valid email address.",
  delivery:
    "Could not send verification code. Please check the email address and try again.",
  rateLimit: "Too many verification attempts. Please wait a moment and try again.",
  cooldown: "Resend is not available yet.",
  session: "Your session has expired. Please verify your phone number again.",
  conflict: "Please use your previous email or start over.",
  alreadyLinked:
    "This email cannot be used for this account. Please use another email or contact support.",
  pendingDeletion:
    "This email belongs to an account scheduled for deletion. It cannot be reused until deletion is complete.",
} as const;

function signalCopy(error: unknown): string {
  const kind = classifyPublicError(error);
  if (kind === "age_not_admitted") return PUBLIC_ERROR_COPY.age_not_admitted;
  if (kind === "network") return PUBLIC_ERROR_COPY.network;
  if (kind === "too_many_attempts") return EMAIL_OTP_SEND_USER_COPY.rateLimit;
  if (kind === "session_expired") return EMAIL_OTP_SEND_USER_COPY.session;
  if (kind === "invalid_otp") return PUBLIC_ERROR_COPY.invalid_otp;
  if (kind === "otp_expired") return PUBLIC_ERROR_COPY.otp_expired;
  const msg = error instanceof Error ? error.message : "";
  if (/valid email/i.test(msg)) return EMAIL_OTP_SEND_USER_COPY.invalidEmail;
  if (/too many|rate|wait/i.test(msg)) return EMAIL_OTP_SEND_USER_COPY.rateLimit;
  if (/unauthenticated|session has expired|sign in again/i.test(msg)) {
    return EMAIL_OTP_SEND_USER_COPY.session;
  }
  if (/previous email or start over|something changed/i.test(msg)) {
    return EMAIL_OTP_SEND_USER_COPY.conflict;
  }
  return EMAIL_OTP_SEND_USER_COPY.delivery;
}

export function presentEmailOtpSendError(error: unknown): string {
  if (error instanceof AppError) {
    switch (error.code) {
      case "save_failed":
        return EMAIL_OTP_SEND_USER_COPY.invalidEmail;
      case "email_otp_cooldown":
        return EMAIL_OTP_SEND_USER_COPY.cooldown;
      case "too_many_attempts":
        return EMAIL_OTP_SEND_USER_COPY.rateLimit;
      case "auth_failed":
      case "session_expired":
        return EMAIL_OTP_SEND_USER_COPY.session;
      case "otp_send_failed":
        return EMAIL_OTP_SEND_USER_COPY.delivery;
      case "email_already_linked":
        return EMAIL_OTP_SEND_USER_COPY.alreadyLinked;
      case "email_pending_deletion":
        return EMAIL_OTP_SEND_USER_COPY.pendingDeletion;
      default:
        return signalCopy(error);
    }
  }
  return signalCopy(error);
}
