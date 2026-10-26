/**
 * Typed errors so screens can branch on cause without parsing English strings.
 */

import { toPublicError } from "@/domain/publicErrors";

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
  return toPublicError(e).message;
}
