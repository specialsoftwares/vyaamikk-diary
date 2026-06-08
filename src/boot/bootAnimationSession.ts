/**
 * In-memory boot animation guard — once per cold JS session only.
 * Resets on force-quit / full reload; never persists to storage.
 */

let bootAnimationConsumedThisSession = false;

/** Returns true the first time per session; false on subsequent calls. */
export function consumeBootAnimationSlot(): boolean {
  if (bootAnimationConsumedThisSession) return false;
  bootAnimationConsumedThisSession = true;
  return true;
}

/** Test helper only. */
export function resetBootAnimationSessionForTests(): void {
  bootAnimationConsumedThisSession = false;
}
