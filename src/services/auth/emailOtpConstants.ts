/** Shared email OTP timing constants (client + tests). */
export const EMAIL_OTP_LENGTH = 6;
export const EMAIL_OTP_TTL_MS = 15 * 60 * 1000;
export const EMAIL_OTP_RESEND_COOLDOWN_MS = 30 * 1000;
export const EMAIL_OTP_MAX_ATTEMPTS = 3;
export const EMAIL_OTP_LOCK_MS = 60 * 60 * 1000;
