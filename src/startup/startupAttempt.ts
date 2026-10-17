/**
 * Startup attempt rules. A reveal deadline does not cancel in-flight native
 * work, and a second retry must not start another migration while the first
 * attempt is still running.
 */

export const STARTUP_REVEAL_MS = 12_000;

export function startupRetryMayStart(inFlight: boolean): boolean {
  return !inFlight;
}

export function startupResultMayPublish(attempt: number, liveAttempt: number): boolean {
  return attempt === liveAttempt;
}
