/**
 * Dark-auth secondary-active appearance — Edit / Change / Choose.
 *
 * Never derive enabled colors from device `colors.primaryLight` / `tokens.link`
 * (dark primaryLight ≈ #252A52 on card ≈ #12152E looks disabled).
 */

import type { ActionState } from "@/actionSystem/types";

/** Fixed periwinkle / indigo-family accents for always-dark auth surfaces. */
export const AUTH_SECONDARY_ACTIVE = {
  fg: "#A5B4FC",
  border: "#A5B4FC",
  fill: "rgba(165,180,252,0.12)",
  pressedFill: "rgba(165,180,252,0.22)",
  disabledFg: "rgba(199,210,254,0.42)",
  disabledBorder: "rgba(165,180,252,0.28)",
  disabledFill: "rgba(165,180,252,0.06)",
  /** Reference dark auth card surface for contrast contracts. */
  referenceCardBg: "#12152E",
} as const;

export type AuthSecondaryActiveAppearance = {
  color: string;
  borderColor: string;
  backgroundColor: string;
};

export function resolveAuthSecondaryActiveAppearance(
  state: Exclude<ActionState, "pressed"> | "pressed"
): AuthSecondaryActiveAppearance {
  if (state === "disabled") {
    return {
      color: AUTH_SECONDARY_ACTIVE.disabledFg,
      borderColor: AUTH_SECONDARY_ACTIVE.disabledBorder,
      backgroundColor: AUTH_SECONDARY_ACTIVE.disabledFill,
    };
  }
  if (state === "pressed" || state === "loading") {
    return {
      color: AUTH_SECONDARY_ACTIVE.fg,
      borderColor: AUTH_SECONDARY_ACTIVE.border,
      backgroundColor: AUTH_SECONDARY_ACTIVE.pressedFill,
    };
  }
  return {
    color: AUTH_SECONDARY_ACTIVE.fg,
    borderColor: AUTH_SECONDARY_ACTIVE.border,
    backgroundColor: AUTH_SECONDARY_ACTIVE.fill,
  };
}

/** Unsafe legacy path used by some auth link-styled controls — must not back secondary-active. */
export function isUnsafeAuthLinkColor(color: string, devicePrimaryLight: string): boolean {
  return color.trim().toLowerCase() === devicePrimaryLight.trim().toLowerCase();
}
