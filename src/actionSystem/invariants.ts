import type { ActionState } from "@/actionSystem/types";

/** Minimum touch target (dp) for semantic actions / card affordances. */
export const ACTION_MIN_TARGET_DP = 44;

/** Restrained press: scale floor (Premium legacy uses 0.97). */
export const ACTION_PRESS_SCALE = 0.97;

/** Restrained press: opacity when using opacity feedback (AuthV2 primary). */
export const ACTION_PRESS_OPACITY = 0.92;

export interface ActionInteractionInput {
  disabled?: boolean;
  loading?: boolean;
  /** When true, pressed visual is active (caller supplies from Pressable). */
  pressed?: boolean;
}

export interface ActionInteractionResolved {
  state: ActionState;
  /** False ⇒ onPress must be undefined / no-op. */
  pressable: boolean;
  accessibilityRole: "button";
  accessibilityState: { disabled: boolean; busy: boolean };
}

/**
 * Single source for enabled / loading / disabled truth.
 *
 * ENABLED: pressable, a11y disabled=false
 * LOADING: not pressable, busy=true, a11y disabled=false (unless also disabled)
 * DISABLED: not pressable, a11y disabled=true
 */
export function resolveActionInteraction(
  input: ActionInteractionInput
): ActionInteractionResolved {
  const disabled = Boolean(input.disabled);
  const loading = Boolean(input.loading);
  const pressed = Boolean(input.pressed);

  let state: ActionState = "default";
  if (disabled && !loading) state = "disabled";
  else if (loading) state = "loading";
  else if (pressed) state = "pressed";

  return {
    state,
    pressable: !disabled && !loading,
    accessibilityRole: "button",
    accessibilityState: {
      disabled,
      busy: loading,
    },
  };
}

/**
 * Primary loading chrome:
 * - retainActiveChrome=true → keep enabled footprint (AuthV2 / new Premium loadingLabel path)
 * - retainActiveChrome=false + loading → muted (legacy Premium spinner-only)
 * - disabled (idle) → muted
 */
export function resolvePrimaryLoadingChrome(input: {
  disabled?: boolean;
  loading?: boolean;
  retainActiveChrome?: boolean;
}): "active" | "muted" {
  if (input.loading && input.retainActiveChrome) return "active";
  if (input.disabled) return "muted";
  if (input.loading) return "muted";
  return "active";
}
