/**
 * Typed errors so screens can branch on cause without parsing English strings.
 */

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

export function userFacingMessage(e: unknown): string {
  if (e instanceof AppError) {
    switch (e.code) {
      case "network":
        return "No internet connection. Please check your network and try again.";
      case "invalid_phone":
        return "Please enter a valid 10-digit mobile number.";
      case "invalid_otp":
        return e.message || "Incorrect OTP. Please try again.";
      case "otp_expired":
        return e.message || "OTP expired. Please request a new code.";
      case "otp_send_failed":
        return e.message || "Could not send the verification code. Try again.";
      case "auth_failed":
        return e.message || "Sign-in failed. Please try again.";
      case "too_many_attempts":
        return "Too many attempts. Please wait a few minutes and try again.";
      case "auth_not_configured":
        return "Login service is not configured for this build.";
      case "session_expired":
        return "Your session expired. Please log in again.";
      case "not_found":
        return e.message || "We couldn't find that entry.";
      case "permission_denied":
        return e.message || "You don't have permission to perform this action.";
      case "account_pending_deletion":
        return e.message;
      case "email_already_linked":
      case "email_pending_deletion":
        return e.message;
      case "email_otp_cooldown":
        return e.message || "Resend is not available yet.";
      case "save_failed":
        return "Couldn't save right now. Please try again.";
      case "delete_failed":
        return "Couldn't delete right now. Please try again.";
      case "offline_read_only":
        return (
          e.message ||
          "You can view existing records, but creating, editing, deleting, PDF generation, sharing, and sync are unavailable until you reconnect and this device is re-validated."
        );
      default:
        return e.message || "Something went wrong.";
    }
  }
  if (e instanceof Error) return e.message;
  return "Something went wrong.";
}
