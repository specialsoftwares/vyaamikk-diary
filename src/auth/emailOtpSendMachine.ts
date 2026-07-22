/**
 * Email OTP send lifecycle for navigate-first / send-in-background.
 */

export type EmailOtpSendState =
  | "idle"
  | "sending"
  | "challengeCreated"
  | "failed";

export interface EmailOtpSendMachine {
  state: EmailOtpSendState;
  challengeId: string | null;
  expiresAt: number | null;
  resendAvailableAt: number | null;
  challengeVersion: number;
  /** Monotonic generation — late responses from abandoned gens are ignored. */
  generation: number;
  errorMessage: string | null;
  /** Digits typed while sending — retained, not auto-submitted as incorrect. */
  retainedDigits: string;
}

export function createEmailOtpSendMachine(): EmailOtpSendMachine {
  return {
    state: "idle",
    challengeId: null,
    expiresAt: null,
    resendAvailableAt: null,
    challengeVersion: 0,
    generation: 0,
    errorMessage: null,
    retainedDigits: "",
  };
}

export function beginEmailOtpSend(machine: EmailOtpSendMachine): EmailOtpSendMachine {
  return {
    ...machine,
    state: "sending",
    generation: machine.generation + 1,
    errorMessage: null,
    // Keep digits if retrying after failure; clear only on brand-new challenge success path.
  };
}

export function completeEmailOtpSend(
  machine: EmailOtpSendMachine,
  generation: number,
  result: {
    challengeId: string;
    expiresAt: number;
    resendAvailableAt: number;
  }
): EmailOtpSendMachine | null {
  if (generation !== machine.generation) return null; // abandoned / late
  if (machine.state !== "sending") return null;
  return {
    ...machine,
    state: "challengeCreated",
    challengeId: result.challengeId,
    expiresAt: result.expiresAt,
    resendAvailableAt: result.resendAvailableAt,
    challengeVersion: machine.challengeVersion + 1,
    errorMessage: null,
  };
}

export function failEmailOtpSend(
  machine: EmailOtpSendMachine,
  generation: number,
  message: string
): EmailOtpSendMachine | null {
  if (generation !== machine.generation) return null;
  if (machine.state !== "sending") return null;
  return {
    ...machine,
    state: "failed",
    challengeId: null,
    errorMessage: message || "OTP could not be sent",
  };
}

export function setRetainedDigits(
  machine: EmailOtpSendMachine,
  digits: string
): EmailOtpSendMachine {
  return { ...machine, retainedDigits: digits };
}

export function canVerifyEmailOtp(machine: EmailOtpSendMachine): boolean {
  return machine.state === "challengeCreated" && Boolean(machine.challengeId);
}

export function isBackBlockedDuringEmailSend(machine: EmailOtpSendMachine): boolean {
  return machine.state === "sending";
}

export function shouldAutoSubmitRetainedDigits(machine: EmailOtpSendMachine): boolean {
  // Spec: auto-submit at most once only if unambiguous — require explicit Verify
  // when digits were entered before challenge existed.
  return (
    machine.state === "challengeCreated" &&
    machine.retainedDigits.length === 6 &&
    Boolean(machine.challengeId)
  );
}
