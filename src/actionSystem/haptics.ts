import type { ActionHapticPolicy, ActionPurpose } from "@/actionSystem/types";

/**
 * Stage 1: policy metadata only — do not fire haptics app-wide here.
 *
 * Future: success on meaningful confirm/verify; destructiveConfirm on delete confirm;
 * never on Edit / Change / Back / Resend / Skip / ordinary card taps.
 */
export function defaultHapticForPurpose(purpose: ActionPurpose): ActionHapticPolicy {
  switch (purpose) {
    case "advance":
    case "save":
      return "success";
    case "delete":
      return "destructiveConfirm";
    case "modify":
    case "security":
    case "retry":
    case "remove":
    case "navigate":
      return "none";
    default: {
      const _exhaustive: never = purpose;
      return _exhaustive;
    }
  }
}

/** Routines that must never haptic on press (policy guard for later wiring). */
export const ACTION_HAPTIC_NEVER_ON_PRESS = [
  "edit",
  "change",
  "back",
  "resend",
  "skip",
  "card_tap_ordinary",
] as const;
