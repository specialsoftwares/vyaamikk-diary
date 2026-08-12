/**
 * V1 Action System — semantic contract (Stage 1 foundation).
 *
 * Visual family is independent of semantic purpose.
 * Do not explode one visual variant per business verb.
 */

/** Visual families — how the control looks. */
export type ActionVisualFamily = "primary" | "secondary" | "tertiary" | "destructive";

/**
 * Semantic purpose — why the control exists.
 * Recovery/security are purposes, not separate visual families.
 */
export type ActionPurpose =
  | "advance"
  | "save"
  | "modify"
  | "security"
  | "retry"
  | "remove"
  | "delete"
  | "navigate";

/** Interaction states every standardized action must support. */
export type ActionState = "default" | "pressed" | "loading" | "disabled";

/** Future haptic policy metadata — Stage 1 exposes types only; no app-wide firing. */
export type ActionHapticPolicy = "none" | "success" | "destructiveConfirm";

export type ActionSeverity = "low" | "medium" | "high";

export interface ActionSemanticSpec {
  visual: ActionVisualFamily;
  purpose: ActionPurpose;
  /** Optional severity for destructive ladder (remove vs delete account). */
  severity?: ActionSeverity;
  haptic?: ActionHapticPolicy;
}

/**
 * Default visual mapping for a purpose — guidance for migrations, not a hard render rule.
 * Security may still render as secondary; recovery (retry) may render as tertiary.
 */
export function defaultVisualForPurpose(purpose: ActionPurpose): ActionVisualFamily {
  switch (purpose) {
    case "advance":
    case "save":
      return "primary";
    case "modify":
    case "security":
      return "secondary";
    case "retry":
    case "navigate":
      return "tertiary";
    case "remove":
      return "secondary";
    case "delete":
      return "destructive";
    default: {
      const _exhaustive: never = purpose;
      return _exhaustive;
    }
  }
}

/** Recovery is purpose `retry` (or countdown-gated tertiary), never confused with navigate. */
export function isRecoveryPurpose(purpose: ActionPurpose): boolean {
  return purpose === "retry";
}

export function isNavigationPurpose(purpose: ActionPurpose): boolean {
  return purpose === "navigate";
}

export function isSecurityPurpose(purpose: ActionPurpose): boolean {
  return purpose === "security";
}
