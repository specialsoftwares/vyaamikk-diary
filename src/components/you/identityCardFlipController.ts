/**
 * Interaction lock for the DigitalBusinessIdentityCard flip animation.
 *
 * The previous implementation cleared `animatingRef` only when the Reanimated
 * timing callback reported `finished === true`; an interrupted animation left
 * the hero card permanently unresponsive. This controller makes lock release
 * idempotent from every path (animation callback, blur, unmount) and adds a
 * defensive timeout so a dropped callback can never leave the lock set.
 *
 * Pure TypeScript so lock recovery is unit-testable in Node.
 */

/** Slack beyond the flip duration before the defensive release fires. */
export const FLIP_LOCK_TIMEOUT_SLACK_MS = 300;

export interface FlipLockController {
  isLocked(): boolean;
  /**
   * Acquire the lock for one flip. Returns false (flip rejected) when an
   * animation is already in flight — prevents duplicate concurrent flips.
   * Arms a defensive timeout that forces release if nothing else does.
   */
  acquire(): boolean;
  /**
   * Release from any completion path. Idempotent — returns true only for
   * the call that actually released. Cancels the defensive timeout.
   */
  release(): boolean;
  /** Unmount — cancels timers, leaves the lock released. */
  dispose(): void;
}

export function createFlipLockController(options: {
  timeoutMs: number;
  scheduleTimeout: (fn: () => void, ms: number) => () => void;
  /** Fired when the defensive timeout releases a stuck lock — the component
   * snaps transforms back to a stable side here. */
  onForcedRelease: () => void;
}): FlipLockController {
  let locked = false;
  let cancelTimeout: (() => void) | null = null;
  let disposed = false;

  const clearTimer = () => {
    cancelTimeout?.();
    cancelTimeout = null;
  };

  const release = (): boolean => {
    clearTimer();
    if (!locked) return false;
    locked = false;
    return true;
  };

  return {
    isLocked: () => locked,

    acquire() {
      if (disposed || locked) return false;
      locked = true;
      cancelTimeout = options.scheduleTimeout(() => {
        cancelTimeout = null;
        if (!locked || disposed) return;
        locked = false;
        options.onForcedRelease();
      }, options.timeoutMs);
      return true;
    },

    release,

    dispose() {
      disposed = true;
      release();
    },
  };
}
