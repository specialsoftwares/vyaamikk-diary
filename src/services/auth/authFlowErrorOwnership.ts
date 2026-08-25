/**
 * Transient operation errors belong only to the screen that produced them
 * unless explicitly promoted to an account-level error.
 */

export type AuthTransientErrorSurface = "phone" | "phone_otp" | "email" | "email_otp";

export type AuthFlowPhaseHint = "send" | "verify" | "post_auth" | "unknown";

export function resolveAuthErrorSurface(input: {
  step: string;
  phase: AuthFlowPhaseHint;
}): AuthTransientErrorSurface {
  if (input.step === "email_verify") return "email_otp";
  if (input.step === "email") return "email";
  if (input.phase === "send") return "phone";
  return "phone_otp";
}

export function errorVisibleOnSurface(
  errorSurface: AuthTransientErrorSurface | null | undefined,
  screen: AuthTransientErrorSurface
): boolean {
  return Boolean(errorSurface) && errorSurface === screen;
}
