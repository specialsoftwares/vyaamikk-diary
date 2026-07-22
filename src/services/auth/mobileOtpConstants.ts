/**
 * Mobile (SMS) OTP policy constants — mirrored by trusted backend where present.
 * Local-mock must follow these windows exactly.
 */

export const MOBILE_OTP_LENGTH = 6;
/** Validity window for a login mobile OTP. */
export const MOBILE_OTP_TTL_MS = 10 * 60 * 1000;
/** Visible resend cooldown. */
export const MOBILE_OTP_RESEND_COOLDOWN_MS = 30 * 1000;
/** Incorrect verification attempts before lock. */
export const MOBILE_OTP_MAX_ATTEMPTS = 3;
/** Lock duration after third incorrect attempt (per mobile + purpose). */
export const MOBILE_OTP_LOCK_MS = 15 * 60 * 1000;
/** Rolling-hour send ceiling per mobile number. */
export const MOBILE_OTP_MAX_SENDS_PER_HOUR = 5;

/**
 * Deterministic local-mock development OTP.
 * Accepted only when `isApprovedLocalMockMobileOtpEnvironment()` is true.
 */
export const LOCAL_MOCK_DETERMINISTIC_MOBILE_OTP = "000000";

/** Legacy mock OTP — must be rejected after alignment. */
export const LEGACY_LOCAL_MOCK_MOBILE_OTP = "123456";

export type MobileOtpPurpose =
  | "login"
  | "mobile_change_current"
  | "mobile_change_new"
  | "recovery_new_mobile"
  | "account_deletion";
