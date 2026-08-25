/**
 * Production user-facing auth copy. Never include Firebase codes, function
 * names, regions, stacks, or raw contacts.
 */

export const AUTH_USER_FACING_COPY = {
  invalidOtp: "Incorrect verification code. Check the SMS and try again.",
  expiredOtp: "This verification code has expired. Request a new code.",
  network: "We couldn't connect. Check your internet connection and try again.",
  tooManyRequests: "Too many attempts. Please wait a few minutes and try again.",
  contactUnavailable:
    "This mobile number cannot be used for this account. Please use another number or contact support.",
  unknownAuthFailure: "We couldn't finish this step. Please try again.",
  sendFailed: "Could not send the verification code. Check the number and try again.",
  sessionLost: "Verification session was lost. Please request a new code.",
} as const;

export type AuthUserFacingCopyKey = keyof typeof AUTH_USER_FACING_COPY;
