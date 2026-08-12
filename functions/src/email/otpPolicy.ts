/**
 * Email OTP constants + pure policy (Functions + mirrored client messages).
 */

export const EMAIL_OTP_LENGTH = 6;
export const EMAIL_OTP_TTL_MS = 15 * 60 * 1000;
export const EMAIL_OTP_RESEND_COOLDOWN_MS = 30 * 1000;
export const EMAIL_OTP_MAX_ATTEMPTS = 3;
export const EMAIL_OTP_LOCK_MS = 60 * 60 * 1000;

/** Soft account-level abuse windows (in addition to visible product rules). */
export const EMAIL_OTP_MAX_SENDS_PER_UID_HOUR = 10;
export const EMAIL_OTP_MAX_DISTINCT_EMAILS_PER_UID_DAY = 5;
export const EMAIL_OTP_MAX_SENDS_PER_EMAIL_HOUR = 8;

export type EmailOtpServerErrorCode =
  | "EMAIL_INVALID"
  | "EMAIL_ALREADY_BOUND"
  | "EMAIL_REVIEW_EDIT_LIMIT"
  | "EMAIL_OTP_COOLDOWN"
  | "EMAIL_OTP_EXPIRED"
  | "EMAIL_OTP_INVALID"
  | "EMAIL_OTP_LOCKED"
  | "EMAIL_VERIFICATION_REQUIRED"
  | "EMAIL_PROVIDER_UNAVAILABLE"
  | "RATE_LIMITED"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NETWORK_ERROR"
  | "CONFLICT";

export const EMAIL_OTP_USER_MESSAGES: Record<EmailOtpServerErrorCode, string> = {
  EMAIL_INVALID: "Enter a valid email address.",
  EMAIL_ALREADY_BOUND:
    "This email cannot be used for this account. Please use another email or contact support.",
  EMAIL_REVIEW_EDIT_LIMIT: "You can change your email twice during signup review.",
  EMAIL_OTP_COOLDOWN: "Resend is not available yet.",
  EMAIL_OTP_EXPIRED: "That code has expired. Request a new one.",
  EMAIL_OTP_INVALID: "Incorrect code. Please try again.",
  EMAIL_OTP_LOCKED:
    "Too many incorrect attempts. This email is locked for 1 hour — or enter a different email.",
  EMAIL_VERIFICATION_REQUIRED: "Verify your email to continue.",
  EMAIL_PROVIDER_UNAVAILABLE: "Email delivery is temporarily unavailable. Try again later.",
  RATE_LIMITED: "Too many requests. Please wait and try again.",
  UNAUTHENTICATED: "Sign in again to continue.",
  FORBIDDEN: "You cannot perform this action.",
  NETWORK_ERROR: "Network error. Check your connection and try again.",
  CONFLICT: "Something changed. Refresh and try again.",
};

export function normalizeEmailStrict(raw: string): string {
  return raw.trim().toLowerCase();
}

export function isValidEmailSyntaxServer(raw: string): boolean {
  const normalized = normalizeEmailStrict(raw);
  if (!normalized || normalized.length > 254) return false;
  const at = normalized.indexOf("@");
  if (at <= 0 || at !== normalized.lastIndexOf("@")) return false;
  return /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i.test(
    normalized
  );
}
