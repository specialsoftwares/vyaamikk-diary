/**
 * Typed errors so screens can branch on cause without parsing English strings.
 */

import {
  isUnsafePublicText,
  PUBLIC_ERROR_COPY,
  publicMessage,
} from "./publicErrorCatalogue";

export {
  PUBLIC_ERROR_CATALOGUE,
  PUBLIC_ERROR_COPY,
  PUBLIC_ERROR_MESSAGE_IDS,
  classifyPublicError,
  isUnsafePublicText,
  publicMessage,
  publicMessageId,
  type PublicErrorCode,
  type PublicErrorEntry,
  type PublicErrorMessageId,
} from "./publicErrorCatalogue";

export type AppErrorCode =
  | "network"
  | "invalid_phone"
  | "invalid_otp"
  | "otp_expired"
  | "otp_send_failed"
  | "auth_failed"
  | "too_many_attempts"
  | "auth_not_configured"
  | "session_expired"
  | "not_found"
  | "permission_denied"
  | "account_pending_deletion"
  | "email_already_linked"
  | "email_pending_deletion"
  | "email_otp_cooldown"
  | "save_failed"
  | "delete_failed"
  | "offline_read_only"
  | "quota_exhausted"
  | "quota_state_invalid"
  | "age_not_admitted"
  | "unknown";

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly cause: unknown;
  readonly details?: Record<string, string | number | boolean | null>;

  constructor(
    code: AppErrorCode,
    message: string,
    cause?: unknown,
    details?: Record<string, string | number | boolean | null>
  ) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.cause = cause;
    this.details = details;
  }
}

export function toAppError(e: unknown, fallback: AppErrorCode = "unknown"): AppError {
  if (e instanceof AppError) return e;
  if (e instanceof Error) return new AppError(fallback, e.message, e);
  return new AppError(fallback, "Something went wrong.", e);
}

/**
 * Keep an app-authored sentence. Backend text, paths, and internal codes
 * are replaced with catalogue copy and are never shown.
 */
function shown(error: AppError, emptyFallback: string | null): string {
  const raw = error.message;
  const value = raw.trim();
  if (!value) return emptyFallback === null ? raw : emptyFallback;
  if (isUnsafePublicText(value) || /^[a-z0-9_]+$/.test(value)) return publicMessage(error);
  return raw;
}

export function userFacingMessage(e: unknown): string {
  if (e instanceof AppError) {
    switch (e.code) {
      case "network":
        return "No internet connection. Please check your network and try again.";
      case "invalid_phone":
        return "Please enter a valid 10-digit mobile number.";
      case "invalid_otp":
        return shown(e, "Incorrect OTP. Please try again.");
      case "otp_expired":
        return shown(e, "OTP expired. Please request a new code.");
      case "otp_send_failed":
        return shown(e, "Could not send the verification code. Try again.");
      case "auth_failed":
        return shown(e, "Sign-in failed. Please try again.");
      case "too_many_attempts":
        return "Too many attempts. Please wait a few minutes and try again.";
      case "auth_not_configured":
        return "Login service is not configured for this build.";
      case "session_expired":
        return "Your session expired. Please log in again.";
      case "not_found":
        return shown(e, "We couldn't find that entry.");
      case "permission_denied":
        return shown(e, "You don't have permission to perform this action.");
      case "account_pending_deletion":
        return shown(e, null);
      case "email_already_linked":
      case "email_pending_deletion":
        return shown(e, null);
      case "email_otp_cooldown":
        return shown(e, "Resend is not available yet.");
      case "save_failed":
        return "Couldn't save right now. Please try again.";
      case "delete_failed":
        return "Couldn't delete right now. Please try again.";
      case "offline_read_only":
        return shown(
          e,
          "You can view existing records, but creating, editing, deleting, PDF generation, sharing, and sync are unavailable until you reconnect and this device is re-validated."
        );
      case "quota_exhausted":
        return shown(e, "Monthly record limit reached. This save was not completed.");
      case "quota_state_invalid":
        return shown(e, "Couldn't save right now. Please try again.");
      case "age_not_admitted":
        return PUBLIC_ERROR_COPY.age_not_admitted;
      default:
        return shown(e, "Something went wrong.");
    }
  }
  if (e instanceof Error) {
    const value = e.message.trim();
    if (!value || isUnsafePublicText(value)) return publicMessage(e);
    return e.message;
  }
  return "Something went wrong.";
}
