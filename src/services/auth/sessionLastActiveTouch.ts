/**
 * Idempotent guard for `lastActiveAt` heartbeat writes.
 *
 * AuthProvider's signed-in effect (and React Strict Mode double-invoke) can
 * call touchLastActive twice before either await completes. This module
 * claims a session activation synchronously so only one profile write runs
 * per uid within the throttle window.
 */

export const LAST_ACTIVE_TOUCH_THROTTLE_MS = 60_000;

export interface SessionLastActiveClaim {
  /** Wall-clock ms to write, or null if this call must no-op. */
  now: number | null;
}

interface GuardState {
  uid: string | null;
  claimedAt: number;
  inFlight: boolean;
}

const state: GuardState = {
  uid: null,
  claimedAt: 0,
  inFlight: false,
};

/**
 * Synchronously decide whether this activation may write `lastActiveAt`.
 * Pass the max of profile/session lastActiveAt as `previousAt`.
 */
export function claimSessionLastActiveTouch(input: {
  uid: string;
  previousAt: number;
  now?: number;
  throttleMs?: number;
}): SessionLastActiveClaim {
  const now = input.now ?? Date.now();
  const throttleMs = input.throttleMs ?? LAST_ACTIVE_TOUCH_THROTTLE_MS;
  const prev = Math.max(
    input.previousAt,
    state.uid === input.uid ? state.claimedAt : 0
  );

  if (now - prev < throttleMs) {
    return { now: null };
  }
  if (state.uid === input.uid && state.inFlight) {
    return { now: null };
  }

  state.uid = input.uid;
  state.claimedAt = now;
  state.inFlight = true;
  return { now };
}

export function releaseSessionLastActiveTouch(uid: string): void {
  if (state.uid === uid) {
    state.inFlight = false;
  }
}

/** Clear on logout / identity change so the next session can touch once. */
export function clearSessionLastActiveTouch(uid?: string | null): void {
  if (uid == null || state.uid === uid || state.uid == null) {
    state.uid = null;
    state.claimedAt = 0;
    state.inFlight = false;
  }
}

export function resetSessionLastActiveTouchForTests(): void {
  clearSessionLastActiveTouch();
}
