/**
 * Format remaining seconds as MM:SS (e.g. 00:30, 14:32).
 */
export function formatOtpCountdownMmSs(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

/**
 * Remaining whole seconds until an authoritative timestamp.
 * Uses ceil so UI does not enable Resend a fraction early.
 */
export function remainingSecondsUntil(targetAtMs: number, nowMs = Date.now()): number {
  return Math.max(0, Math.ceil((targetAtMs - nowMs) / 1000));
}
