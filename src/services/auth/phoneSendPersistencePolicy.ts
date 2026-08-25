/**
 * Phone Send may paint OTP before some local writes finish.
 * Security-critical native Firebase session persist still completes inside
 * `startNativePhoneOtp` before that promise resolves.
 */

export type PhoneSendLocalWrite =
  | "pending_consent"
  | "wrapper_challenge"
  | "wizard_step"
  | "otp_digit_snapshot"
  | "native_firebase_session";

export type PersistFailureEffect = "resumability_only" | "must_not_fail_open_auth";

/** Visible OTP screen must not wait on these stores. */
export function maySkipAwaitBeforeOtpScreenPaint(write: PhoneSendLocalWrite): boolean {
  return write !== "native_firebase_session";
}

export function persistFailureEffect(write: PhoneSendLocalWrite): PersistFailureEffect {
  if (write === "native_firebase_session") return "must_not_fail_open_auth";
  return "resumability_only";
}

/**
 * Same-process verify uses in-memory confirmation + Firebase verificationId.
 * Missing wrapper/challenge AsyncStorage after process death may force a new send;
 * it must not invent a verified identity.
 */
export function challengePersistFailureDoesNotAuthenticate(): true {
  return true;
}
