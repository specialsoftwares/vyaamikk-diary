import { ACTION_MIN_TARGET_DP } from "@/actionSystem/invariants";

/**
 * Future Stage 2 Review card affordance contract.
 * Visible Edit/Change remains; optional whole-card activation without duplicate a11y targets.
 */

export interface CardActionAffordanceSpec {
  actionLabel: string;
  onAction: () => void;
  /** When true, card press invokes the same action as the chip. */
  wholeCardActivates?: boolean;
  disabled?: boolean;
  minTargetDp?: number;
  accessibilityHint?: string;
}

export interface CardActionAccessibilityPlan {
  minTargetDp: number;
  /** Chip is the sole focus target when whole-card is off. */
  chip: {
    accessibilityRole: "button";
    accessibilityLabel: string;
    accessibilityHint?: string;
    accessibilityState: { disabled: boolean };
    /** Hide chip from a11y tree when card owns the action. */
    accessibilityElementsHidden: boolean;
  };
  card: {
    accessibilityRole: "button" | "none";
    accessibilityLabel?: string;
    accessibilityHint?: string;
    accessibilityState?: { disabled: boolean };
    onPress?: () => void;
  };
}

export function resolveCardActionAccessibility(
  spec: CardActionAffordanceSpec
): CardActionAccessibilityPlan {
  const disabled = Boolean(spec.disabled);
  const minTargetDp = spec.minTargetDp ?? ACTION_MIN_TARGET_DP;
  const whole = Boolean(spec.wholeCardActivates);

  if (whole) {
    return {
      minTargetDp,
      chip: {
        accessibilityRole: "button",
        accessibilityLabel: spec.actionLabel,
        accessibilityHint: spec.accessibilityHint,
        accessibilityState: { disabled },
        accessibilityElementsHidden: true,
      },
      card: {
        accessibilityRole: "button",
        accessibilityLabel: spec.actionLabel,
        accessibilityHint: spec.accessibilityHint,
        accessibilityState: { disabled },
        onPress: disabled ? undefined : spec.onAction,
      },
    };
  }

  return {
    minTargetDp,
    chip: {
      accessibilityRole: "button",
      accessibilityLabel: spec.actionLabel,
      accessibilityHint: spec.accessibilityHint,
      accessibilityState: { disabled },
      accessibilityElementsHidden: false,
    },
    card: {
      accessibilityRole: "none",
      onPress: undefined,
    },
  };
}
