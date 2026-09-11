/**
 * Location-step Continue: persist draft then review.
 * Guards stale in-flight persist so late completion cannot navigate after back.
 */

export const LOCATION_CONTINUE_REVIEW_HREF = "/(auth)/profile-review" as const;

export function createGenerationGuard(): {
  begin: () => number;
  isCurrent: (id: number) => boolean;
  invalidate: () => void;
} {
  let generation = 0;
  return {
    begin(): number {
      generation += 1;
      return generation;
    },
    isCurrent(id: number): boolean {
      return id === generation;
    },
    invalidate(): void {
      generation += 1;
    },
  };
}

export function locationContinueChrome(input: {
  submitting: boolean;
  continueEnabled: boolean;
}): { loading: boolean; disabled: boolean } {
  if (input.submitting) return { loading: true, disabled: true };
  return { loading: false, disabled: !input.continueEnabled };
}

export function decideLocationContinueAction(input: {
  continueEnabled: boolean;
  validationOk: boolean;
  validationMessage?: string;
}): { kind: "blocked"; message: string } | { kind: "persist-then-review" } {
  if (!input.continueEnabled) {
    return {
      kind: "blocked",
      message: input.validationMessage ?? "Confirm your location before continuing.",
    };
  }
  if (!input.validationOk) {
    return {
      kind: "blocked",
      message: input.validationMessage ?? "Confirm your location before continuing.",
    };
  }
  return { kind: "persist-then-review" };
}

export function decideLocationContinueAfterPersist(input: {
  generationCurrent: boolean;
  persistOk: boolean;
  persistMessage?: string;
}): "navigate-review" | "show-error" | "ignore" {
  if (!input.generationCurrent) return "ignore";
  if (!input.persistOk) return "show-error";
  return "navigate-review";
}
