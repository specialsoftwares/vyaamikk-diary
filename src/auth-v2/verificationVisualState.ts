/**
 * Verification overlay state machine — presentation only.
 * Success is never shown before an authoritative resolve event.
 */

export type VerificationVisualPhase = "idle" | "verifying" | "success" | "failure";

export type VerificationVisualEvent =
  | "otp_submitted"
  | "authoritative_success"
  | "authoritative_failure"
  | "success_settled"
  | "reset";

export function reduceVerificationVisual(
  phase: VerificationVisualPhase,
  event: VerificationVisualEvent
): VerificationVisualPhase {
  switch (event) {
    case "otp_submitted":
      if (phase === "verifying" || phase === "success") return phase;
      return "verifying";
    case "authoritative_success":
      if (phase === "verifying") return "success";
      if (phase === "success") return "success";
      return phase;
    case "authoritative_failure":
      if (phase === "success") return "success";
      if (phase === "verifying") return "failure";
      return "failure";
    case "success_settled":
      return phase === "success" ? "idle" : phase;
    case "reset":
      return "idle";
    default:
      return phase;
  }
}

export function verificationShowsSuccessCheck(phase: VerificationVisualPhase): boolean {
  return phase === "success";
}

export function verificationShowsActiveWait(phase: VerificationVisualPhase): boolean {
  return phase === "verifying";
}

export function minVerifyingRemainderMs(input: {
  startedAt: number;
  now: number;
  minVisibleMs: number;
}): number {
  return Math.max(0, input.minVisibleMs - (input.now - input.startedAt));
}
