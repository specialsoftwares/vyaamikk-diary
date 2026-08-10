/**
 * Phase-aware auth error presentation for Phone OTP send / verify / post-auth.
 * Diagnostic codes remain visible through physical-device acceptance testing.
 */

import { AppError } from "@/domain/errors";

export type AuthFlowPhase = "send" | "verify" | "post_auth" | "unknown";

export function resolveAuthFlowPhase(error: unknown): AuthFlowPhase {
  if (!(error instanceof AppError) || !error.details) {
    if (error instanceof AppError) {
      if (error.code === "otp_send_failed") return "send";
      if (error.code === "invalid_otp" || error.code === "otp_expired") return "verify";
      if (error.code === "not_found" || error.code === "auth_failed") return "post_auth";
    }
    return "unknown";
  }
  const phase = error.details.authPhase ?? error.details.phoneAuthPhase;
  if (phase === "send") return "send";
  if (phase === "verify" || phase === "confirm") return "verify";
  if (phase === "post_auth") return "post_auth";
  if (error.code === "otp_send_failed") return "send";
  if (error.code === "invalid_otp" || error.code === "otp_expired") return "verify";
  if (
    error.code === "not_found" ||
    error.code === "auth_failed" ||
    error.details.callableName != null
  ) {
    return "post_auth";
  }
  return "unknown";
}

export function authFlowErrorTitle(error: unknown): string {
  switch (resolveAuthFlowPhase(error)) {
    case "send":
      return "Couldn't send verification code";
    case "verify":
      return "Couldn't verify code";
    case "post_auth":
      return "Couldn't finish account setup";
    default:
      return "Something went wrong";
  }
}

/** Compact diagnostic line for on-screen testing (never secrets). */
export function authFlowDiagnosticCode(error: unknown): string | null {
  if (!(error instanceof AppError) || !error.details) return null;
  const explicit = error.details.diagnosticCode;
  if (typeof explicit === "string" && explicit.trim()) return explicit.trim();

  const parts: string[] = [];
  const phase = resolveAuthFlowPhase(error);
  if (phase !== "unknown") parts.push(`phase=${phase}`);
  if (typeof error.details.failureDomain === "string") {
    parts.push(`domain=${error.details.failureDomain}`);
  }
  if (typeof error.details.functionsErrorCode === "string") {
    parts.push(String(error.details.functionsErrorCode));
  } else if (typeof error.details.firebaseAuthCode === "string") {
    parts.push(String(error.details.firebaseAuthCode));
  } else {
    parts.push(`app=${error.code}`);
  }
  if (typeof error.details.callableName === "string") {
    parts.push(`fn=${error.details.callableName}`);
  }
  if (typeof error.details.functionsRegion === "string") {
    parts.push(`region=${error.details.functionsRegion}`);
  }
  if (error.details.firebaseUserPresent != null) {
    parts.push(`user=${String(error.details.firebaseUserPresent)}`);
  }
  if (error.details.idTokenReady != null) {
    parts.push(`token=${String(error.details.idTokenReady)}`);
  }
  return parts.length ? parts.join(" · ") : null;
}

export function canRetryAccountSetupWithoutSms(error: unknown): boolean {
  if (!(error instanceof AppError) || !error.details) return false;
  if (error.details.retryAccountSetup === true) return true;
  if (resolveAuthFlowPhase(error) !== "post_auth") return false;
  return error.details.firebaseSignInSucceeded === true || error.details.firebaseUserPresent === true;
}

export function canonicalFunctionsRegion(configured?: string | null): string {
  const trimmed = String(configured ?? "").trim();
  return trimmed || "asia-south1";
}
