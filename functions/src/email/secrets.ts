/**
 * Firebase Secret Manager parameters for production email OTP / Resend.
 *
 * Bound secrets are injected at runtime as process.env[NAME] for callables
 * that list them in `secrets: [...]`. Values must never be logged.
 *
 * Canonical Resend credential: EMAIL_PROVIDER_API_KEY
 * (provider.ts still accepts RESEND_API_KEY as a non-Secret Manager fallback
 * when present in the process environment, e.g. local/emulator overrides).
 */

import { defineSecret } from "firebase-functions/params";

export const emailOtpHmacSecret = defineSecret("EMAIL_OTP_HMAC_SECRET");
export const emailProviderApiKey = defineSecret("EMAIL_PROVIDER_API_KEY");
export const emailFromAddress = defineSecret("EMAIL_FROM_ADDRESS");

/** Secrets required by challengeService / provider / emailChange / recovery email paths. */
export const EMAIL_OTP_RUNTIME_SECRETS = [
  emailOtpHmacSecret,
  emailProviderApiKey,
  emailFromAddress,
];
