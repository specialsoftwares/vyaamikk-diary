/** Pure OTP cell model — one logical string, N visual cells. */

export function normalizeOtpDigits(raw: string, length: number): string {
  return String(raw ?? "")
    .replace(/\D/g, "")
    .slice(0, length);
}

export function otpCellsFromValue(value: string, length: number): string[] {
  const digits = normalizeOtpDigits(value, length);
  return Array.from({ length }, (_, i) => digits[i] ?? "");
}

export function isOtpComplete(value: string, length: number): boolean {
  return normalizeOtpDigits(value, length).length === length;
}

export function shouldAutoVerifyOtp(input: {
  digits: string;
  length: number;
  lastSubmitted: string | null;
  inFlight: boolean;
  disabled: boolean;
}): boolean {
  if (input.disabled || input.inFlight) return false;
  if (!isOtpComplete(input.digits, input.length)) return false;
  if (input.lastSubmitted === normalizeOtpDigits(input.digits, input.length)) return false;
  return true;
}

export const OTP_OFFLINE_VERIFY_MESSAGE =
  "You're offline. Connect to the internet to verify this code.";

/** Why the last verify attempt failed — drives recovery chrome only. */
export type OtpVerifyFailureKind = "invalid_code" | "expired" | "locked" | "transient" | null;

export type OtpVerifyUiPhase =
  | "normal_entry"
  | "auto_verifying"
  | "code_error"
  | "expired"
  | "offline"
  | "manual_retry_available";

export function classifyOtpVerifyFailure(code: string | null | undefined): OtpVerifyFailureKind {
  if (!code) return null;
  if (code === "invalid_otp") return "invalid_code";
  if (code === "otp_expired") return "expired";
  if (code === "too_many_attempts") return "locked";
  return "transient";
}

export function resolveOtpVerifyUi(input: {
  digits: string;
  length: number;
  online: boolean;
  loading: boolean;
  lockRemaining: number;
  lastSubmitted: string | null;
  failureKind: OtpVerifyFailureKind;
}): {
  phase: OtpVerifyUiPhase;
  showManualVerifyCta: boolean;
  autoVerifyDisabled: boolean;
} {
  const complete = isOtpComplete(input.digits, input.length);
  const submittedThisCode =
    complete &&
    input.lastSubmitted === normalizeOtpDigits(input.digits, input.length);

  if (!input.online) {
    return {
      phase: "offline",
      showManualVerifyCta: false,
      autoVerifyDisabled: true,
    };
  }

  if (input.loading) {
    return {
      phase: "auto_verifying",
      showManualVerifyCta: false,
      autoVerifyDisabled: true,
    };
  }

  if (input.lockRemaining > 0 || input.failureKind === "locked") {
    return {
      phase: "code_error",
      showManualVerifyCta: false,
      autoVerifyDisabled: true,
    };
  }

  if (input.failureKind === "expired") {
    return {
      phase: "expired",
      showManualVerifyCta: false,
      autoVerifyDisabled: false,
    };
  }

  if (input.failureKind === "invalid_code") {
    return {
      phase: "code_error",
      showManualVerifyCta: false,
      autoVerifyDisabled: false,
    };
  }

  if (input.failureKind === "transient" && submittedThisCode) {
    return {
      phase: "manual_retry_available",
      showManualVerifyCta: true,
      autoVerifyDisabled: true,
    };
  }

  return {
    phase: "normal_entry",
    showManualVerifyCta: false,
    autoVerifyDisabled: false,
  };
}
