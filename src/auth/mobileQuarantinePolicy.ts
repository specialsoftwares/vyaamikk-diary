/**
 * Mobile number quarantine after replacement or account deletion (21 days).
 * Pure policy — server must enforce; client uses for messaging only.
 */

export const MOBILE_QUARANTINE_MS = 21 * 24 * 60 * 60 * 1000;

export const MOBILE_QUARANTINE_USER_MESSAGE =
  "This mobile number is temporarily unavailable. Please try again later.";

export function isMobileInQuarantine(
  quarantineUntil: number | null | undefined,
  now = Date.now()
): boolean {
  if (quarantineUntil == null) return false;
  return quarantineUntil > now;
}

export function quarantineUntilFrom(now = Date.now()): number {
  return now + MOBILE_QUARANTINE_MS;
}

/**
 * Rebind during quarantine releases the newer number immediately without
 * quarantining that newer number (approved rebind scenario).
 */
export interface QuarantineRebindOutcome {
  rebindOldNumber: true;
  cancelOldQuarantine: true;
  releaseNewerNumberImmediately: true;
  quarantineNewerNumber: false;
}
