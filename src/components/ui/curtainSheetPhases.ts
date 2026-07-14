/**
 * Deterministic phase model for CurtainSheet.
 *
 * The Reanimated spring callback is NOT guaranteed to fire with
 * `finished === true` (interruption, cancellation, dropped worklet). This
 * controller makes teardown idempotent and adds a defensive timeout so a
 * dismissed sheet can never stay mounted as an invisible touch trap.
 *
 * Pure TypeScript — no React/React Native imports — so the close/unmount,
 * interrupted-animation, and repeated open/close cases are unit-testable
 * in Node.
 */

export type CurtainPhase = "closed" | "opening" | "open" | "closing";

/** Defensive teardown fallback. The close spring (damping 22 / stiffness 300,
 * overshoot-clamped) settles well under this; if its callback never fires,
 * this forces teardown. */
export const CURTAIN_CLOSE_TIMEOUT_MS = 450;

export interface CurtainPhaseCallbacks {
  /** Fired synchronously on every phase transition (drives React state). */
  onPhaseChange: (phase: CurtainPhase) => void;
  /** Fired exactly once per completed close, before the afterClose callback. */
  onTeardown: () => void;
  /** Timer injection point (setTimeout in the component, fake in tests).
   * Must return a cancel function. */
  scheduleTimeout: (fn: () => void, ms: number) => () => void;
}

export interface CurtainPhaseController {
  getPhase(): CurtainPhase;
  /** visible=true. Returns true when a new open animation should start. */
  requestOpen(): boolean;
  /** Open spring settled (any finished value). */
  handleOpenSettled(): void;
  /** Begin closing. Returns true when a close animation should start.
   * If already closing, an afterClose callback is preserved (first wins).
   * If already closed, afterClose runs immediately. */
  requestClose(afterClose?: () => void): boolean;
  /** Close spring settled OR timeout fired OR animation cancelled — idempotent. */
  handleCloseSettled(): void;
  /** Component unmount — clears timers without firing callbacks. */
  dispose(): void;
}

export function createCurtainPhaseController(
  callbacks: CurtainPhaseCallbacks
): CurtainPhaseController {
  let phase: CurtainPhase = "closed";
  let cancelCloseTimeout: (() => void) | null = null;
  let afterClose: (() => void) | null = null;
  let disposed = false;

  const setPhase = (next: CurtainPhase) => {
    if (phase === next) return;
    phase = next;
    callbacks.onPhaseChange(next);
  };

  const clearCloseTimeout = () => {
    cancelCloseTimeout?.();
    cancelCloseTimeout = null;
  };

  const teardown = () => {
    // Idempotent: only a live "closing" phase may complete a close.
    if (phase !== "closing" || disposed) return;
    clearCloseTimeout();
    setPhase("closed");
    callbacks.onTeardown();
    const next = afterClose;
    afterClose = null;
    next?.();
  };

  return {
    getPhase: () => phase,

    requestOpen() {
      if (disposed) return false;
      if (phase === "open" || phase === "opening") return false;
      // Re-opening while a close is in flight aborts the close: the pending
      // afterClose belongs to the aborted dismissal and must not fire later.
      clearCloseTimeout();
      afterClose = null;
      setPhase("opening");
      return true;
    },

    handleOpenSettled() {
      if (disposed) return;
      if (phase === "opening") setPhase("open");
    },

    requestClose(after?: () => void) {
      if (disposed) return false;
      if (phase === "closed") {
        after?.();
        return false;
      }
      if (phase === "closing") {
        if (after && !afterClose) afterClose = after;
        return false;
      }
      afterClose = after ?? null;
      setPhase("closing");
      cancelCloseTimeout = callbacks.scheduleTimeout(
        () => teardown(),
        CURTAIN_CLOSE_TIMEOUT_MS
      );
      return true;
    },

    handleCloseSettled() {
      teardown();
    },

    dispose() {
      disposed = true;
      clearCloseTimeout();
      afterClose = null;
      phase = "closed";
    },
  };
}
