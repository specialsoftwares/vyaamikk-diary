/**
 * Central deterministic language-transition controller.
 *
 * Every language selector goes through one public entry point
 * (`I18nProvider.setLang` → `controller.request`). The transition is modelled
 * with explicit phases:
 *
 *   idle → preparing (overlay in) → switching (load + apply) → settling
 *   (remount + interactions) → idle (overlay out)
 *
 * Guarantees:
 *   • Rapid duplicate selections are rejected while a transition is in flight.
 *   • The controller ALWAYS returns to "idle" — success, failure, and timeout
 *     paths all run the same teardown, so the overlay can never stay mounted
 *     as a touch blocker.
 *   • The language is persisted only after it has been applied successfully.
 *   • A visual/animation failure cannot lose the language: `applyLanguage`
 *     runs independently of overlay animation (overlay waits are bounded).
 *
 * Pure TypeScript with injected dependencies — unit-testable in Node.
 */

import type { Lang } from "./types";

export type LanguageTransitionPhase = "idle" | "preparing" | "switching" | "settling";

export interface LanguageTransitionResult {
  status: "applied" | "failed" | "rejected";
  lang: Lang;
}

/** Premium-but-lightweight target: overlay visible ~550–650ms total. */
export const LANGUAGE_TRANSITION_MIN_VISIBLE_MS = 600;

/** Hard cap for resource loading + language application. */
export const LANGUAGE_TRANSITION_TIMEOUT_MS = 4000;

/** Bound on waiting for the overlay fade-in — a broken animation must never
 * stall the switch. */
export const LANGUAGE_TRANSITION_OVERLAY_IN_MAX_MS = 400;

export interface LanguageTransitionDeps {
  /**
   * Load locale bundle + script font, then apply the language (i18next
   * changeLanguage + provider state). Must throw on locale/apply failure;
   * font failures should be swallowed by the implementation (system-font
   * fallback).
   */
  applyLanguage: (lang: Lang) => Promise<void>;
  /** Persist preference — called only after applyLanguage succeeds. */
  persistLanguage: (lang: Lang) => Promise<void>;
  /** Remount key bump + InteractionManager settle. Bounded internally. */
  settle: (lang: Lang) => Promise<void>;
  /** Resolves when the overlay has faded in (bounded by the controller). */
  waitForOverlayIn: () => Promise<void>;
  onPhaseChange: (phase: LanguageTransitionPhase, target: Lang | null) => void;
  now?: () => number;
  waitMs?: (ms: number) => Promise<void>;
  minVisibleMs?: number;
  timeoutMs?: number;
  overlayInMaxMs?: number;
}

export interface LanguageTransitionController {
  getPhase(): LanguageTransitionPhase;
  /**
   * Run one transition. Returns "rejected" without side effects when a
   * transition is already in flight or the target equals `current`.
   */
  request(next: Lang, current: Lang, opts?: { instant?: boolean }): Promise<LanguageTransitionResult>;
  /** Unmount — no further phase callbacks fire. */
  dispose(): void;
}

function defaultWait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withTimeout<T>(
  work: Promise<T>,
  ms: number,
  waitMs: (ms: number) => Promise<void>
): Promise<T> {
  let timedOut = false;
  const timeout = waitMs(ms).then(() => {
    timedOut = true;
    throw new Error(`language transition timed out after ${ms}ms`);
  });
  try {
    return await Promise.race([work, timeout]);
  } finally {
    if (!timedOut) {
      // Detach the pending timeout rejection so it never surfaces as unhandled.
      void timeout.catch(() => undefined);
    }
  }
}

export function createLanguageTransitionController(
  deps: LanguageTransitionDeps
): LanguageTransitionController {
  const now = deps.now ?? Date.now;
  const waitMs = deps.waitMs ?? defaultWait;
  const minVisibleMs = deps.minVisibleMs ?? LANGUAGE_TRANSITION_MIN_VISIBLE_MS;
  const timeoutMs = deps.timeoutMs ?? LANGUAGE_TRANSITION_TIMEOUT_MS;
  const overlayInMaxMs = deps.overlayInMaxMs ?? LANGUAGE_TRANSITION_OVERLAY_IN_MAX_MS;

  let phase: LanguageTransitionPhase = "idle";
  let disposed = false;

  const setPhase = (next: LanguageTransitionPhase, target: Lang | null) => {
    phase = next;
    if (!disposed) deps.onPhaseChange(next, target);
  };

  return {
    getPhase: () => phase,

    async request(next, current, opts) {
      if (disposed || phase !== "idle" || next === current) {
        return { status: "rejected", lang: next };
      }

      const instant = opts?.instant === true;
      const startedAt = now();
      let applied = false;

      try {
        setPhase("preparing", next);
        if (!instant) {
          // Bounded: a broken overlay animation must not block the switch.
          await Promise.race([deps.waitForOverlayIn(), waitMs(overlayInMaxMs)]);
        }

        setPhase("switching", next);
        await withTimeout(deps.applyLanguage(next), timeoutMs, waitMs);
        applied = true;

        // Preference follows a successful apply; persist failures are the
        // implementation's concern (non-fatal, resets on next boot).
        await deps.persistLanguage(next);

        setPhase("settling", next);
        await Promise.race([deps.settle(next), waitMs(1000)]);

        if (!instant) {
          const elapsed = now() - startedAt;
          const holdRemaining = minVisibleMs - elapsed;
          if (holdRemaining > 0) await waitMs(holdRemaining);
        }

        return { status: "applied", lang: next };
      } catch {
        return { status: applied ? "applied" : "failed", lang: next };
      } finally {
        // Single teardown for success, failure, and timeout: the overlay
        // unmount is driven by this transition back to idle.
        setPhase("idle", null);
      }
    },

    dispose() {
      disposed = true;
      phase = "idle";
    },
  };
}
