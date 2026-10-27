export type ResendPhase = "unavailable" | "cooling" | "sending" | "offline" | "ready";

export function resolveResendControl(input: {
  resendAvailableAt: number | null;
  remainingSeconds: number;
  online: boolean;
  busy: boolean;
}): ResendPhase {
  if (input.resendAvailableAt == null || !Number.isFinite(input.resendAvailableAt)) return "unavailable";
  if (input.remainingSeconds > 0) return "cooling";
  if (input.busy) return "sending";
  if (!input.online) return "offline";
  return "ready";
}
