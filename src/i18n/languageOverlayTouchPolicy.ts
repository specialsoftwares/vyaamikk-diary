/**
 * Touch policy for the language-transition overlay.
 *
 * The overlay must intercept touches only while a transition is actively
 * blocking the UI. The moment `active` flips false (controller → idle),
 * touches must release on that same render — waiting for a post-paint
 * `hiding` state update leaves a transparent (or fading) full-screen
 * touch trap above tabs and content.
 */

export function languageOverlayPointerEvents(opts: {
  active: boolean;
  hiding: boolean;
}): "auto" | "none" {
  return opts.active && !opts.hiding ? "auto" : "none";
}

/** Failsafe: after idle, force-unmount even if fade-out callbacks are dropped. */
export const LANGUAGE_OVERLAY_UNMOUNT_FAILSAFE_MS = 500;
