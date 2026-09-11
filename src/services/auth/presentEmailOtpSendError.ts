/**
 * User-facing copy for email OTP send failures.
 * Never forwards Firebase / provider exception strings.
 */

import { AppError } from "@/domain/errors";

export const EMAIL_OTP_SEND_USER_COPY = {
  invalidEmail: "Please enter a valid email address.",
  delivery:
    "Could not send verification code. Please check the email address and try again.",
  rateLimit: "Too many verification attempts. Please wait a moment and try again.",
  cooldown: "Resend is not available yet.",
  session: "Your session has expired. Please verify your phone number again.",
  conflict: "Please use your previous email or start over.",
} as const;

function looksLikeInternalException(message: string): boolean {
  return /firebase|functions\/|https:\/\/|exception|stack|INTERNAL/i.test(message);
}

export function presentEmailOtpSendError(error: unknown): string {
  if (error instanceof AppError) {
    switch (error.code) {
      case "save_failed":
        return EMAIL_OTP_SEND_USER_COPY.invalidEmail;
      case "email_otp_cooldown":
        return error.message && !looksLikeInternalException(error.message)
          ? error.message
          : EMAIL_OTP_SEND_USER_COPY.cooldown;
      case "too_many_attempts":
        return EMAIL_OTP_SEND_USER_COPY.rateLimit;
      case "auth_failed":
      case "session_expired":
        return EMAIL_OTP_SEND_USER_COPY.session;
      case "otp_send_failed":
        return EMAIL_OTP_SEND_USER_COPY.delivery;
      case "email_already_linked":
      case "email_pending_deletion":
        return looksLikeInternalException(error.message)
          ? EMAIL_OTP_SEND_USER_COPY.delivery
          : error.message;
      case "permission_denied": {
        const msg = error.message || "";
        if (/valid email/i.test(msg)) return EMAIL_OTP_SEND_USER_COPY.invalidEmail;
        if (/too many|rate|wait/i.test(msg)) return EMAIL_OTP_SEND_USER_COPY.rateLimit;
        if (looksLikeInternalException(msg)) return EMAIL_OTP_SEND_USER_COPY.delivery;
        return msg || EMAIL_OTP_SEND_USER_COPY.delivery;
      }
      default: {
        const msg = error.message || "";
        if (/valid email/i.test(msg)) return EMAIL_OTP_SEND_USER_COPY.invalidEmail;
        if (/unauthenticated|session has expired|sign in again/i.test(msg)) {
          return EMAIL_OTP_SEND_USER_COPY.session;
        }
        if (/previous email or start over|something changed/i.test(msg)) {
          return EMAIL_OTP_SEND_USER_COPY.conflict;
        }
        if (looksLikeInternalException(msg) || !msg) {
          return EMAIL_OTP_SEND_USER_COPY.delivery;
        }
        return msg;
      }
    }
  }
  return EMAIL_OTP_SEND_USER_COPY.delivery;
}
