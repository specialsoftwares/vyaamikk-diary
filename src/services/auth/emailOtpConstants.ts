/** Shared email OTP timing constants (client + tests). */
export const EMAIL_OTP_LENGTH = 6;
export const EMAIL_OTP_TTL_MS = 15 * 60 * 1000;
export const EMAIL_OTP_RESEND_COOLDOWN_MS = 30 * 1000;
export const EMAIL_OTP_MAX_ATTEMPTS = 3;
export const EMAIL_OTP_LOCK_MS = 60 * 60 * 1000;

/**
 * Deterministic local-mock development OTP.
 * Accepted only when `isApprovedLocalMockEmailOtpEnvironment()` is true.
 * Never accepted in Firebase / production paths.
 */
export const LOCAL_MOCK_DETERMINISTIC_EMAIL_OTP = "000000";

/** Legacy deterministic OTP — must be rejected after this fix. */
export const LEGACY_LOCAL_MOCK_EMAIL_OTP = "246810";
