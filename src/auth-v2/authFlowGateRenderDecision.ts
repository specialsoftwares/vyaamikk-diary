/**
 * Pure render routing for AuthFlowGate post-hydration.
 * Extracted so Stage-8 races (challenge cleared while step still "otp") are testable.
 */

export type AuthFlowGateUiStep = "phone" | "confirm" | "otp" | "email" | "email_verify";

export type AuthFlowGateRenderBranch =
  | "boot"
  | "phone_confirm"
  | "otp"
  | "email_verify"
  | "email"
  | "otp_transition"
  | "phone_fallback";

export interface AuthFlowGateRenderInput {
  hydrated: boolean;
  status: "loading" | "signed_out" | "signed_in" | string;
  step: AuthFlowGateUiStep | string;
  challengePresent: boolean;
  phoneE164Present: boolean;
  /** True while handleVerifyOtp / continueAfterPhoneProfile is in flight. */
  mobileVerifyInFlight: boolean;
}

/**
 * Decide which AuthFlowGate surface to show.
 *
 * Critical invariant: clearing the OTP challenge MUST NOT occur before
 * `step` leaves `"otp"`. If that ordering breaks, `step === "otp" && !challenge`
 * must show a transition/boot surface — never a hardcoded "session expired"
 * phone entry (the Stage-8 clean-room failure).
 */
export function resolveAuthFlowGateRenderBranch(
  input: AuthFlowGateRenderInput
): AuthFlowGateRenderBranch {
  if (!input.hydrated || input.status === "loading") return "boot";

  if (input.step === "phone" || input.step === "confirm") return "phone_confirm";

  if (input.step === "otp" && input.challengePresent && input.phoneE164Present) {
    return "otp";
  }

  // Challenge cleared (or missing) while still on otp — post-auth handoff in progress
  // or inconsistent state. Never treat as session expiry.
  if (input.step === "otp") {
    return input.mobileVerifyInFlight || input.phoneE164Present ? "otp_transition" : "phone_fallback";
  }

  if (input.step === "email_verify") return "email_verify";
  if (input.step === "email") return "email";

  return "phone_fallback";
}

/** Whether the phone fallback may claim session expiry (genuine signed-out only). */
export function phoneFallbackMayClaimSessionExpired(input: {
  status: string;
  explicitSessionExpired: boolean;
}): boolean {
  if (input.explicitSessionExpired) return true;
  return input.status === "signed_out";
}
