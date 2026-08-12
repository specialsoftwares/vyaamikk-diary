/**
 * Post-confirm Review completion contracts.
 * Delegates paint-gated rules to workspaceCompletionMachine.
 */

import {
  canAdvancePreparingToReady,
  canAdvanceReadyToYou,
  countYouNavigations,
  destinationForPhase,
  phaseAfterConfirmPress,
  phaseWhenWorkspaceSurfaceShown,
  WORKSPACE_PREPARING_MIN_VISIBLE_MS,
  WORKSPACE_PREPARING_TITLE,
  WORKSPACE_READY_TITLE,
  type WorkspaceCompletionPhase,
  type WorkspacePersistStatus,
} from "@/auth-v2/workspaceCompletionMachine";

export {
  canAdvancePreparingToReady,
  canAdvanceReadyToYou,
  destinationForPhase,
  phaseAfterConfirmPress,
  phaseWhenWorkspaceSurfaceShown,
  WORKSPACE_PREPARING_TITLE,
  WORKSPACE_READY_TITLE,
  type WorkspaceCompletionPhase,
  type WorkspacePersistStatus,
};

export const countFinalYouNavigations = countYouNavigations;

/** Harness/compat: You only after ready settle, never during preparing. */
export function shouldNavigateToYouAfterWorkspaceReady(args: {
  phase: "review" | "setting_up" | "preparing" | "ready";
  alreadyNavigated: boolean;
}): boolean {
  const phase = args.phase === "setting_up" ? "preparing" : args.phase;
  return phase === "ready" && !args.alreadyNavigated;
}

export function phaseImmediatelyAfterReviewConfirm(): "committing" {
  return phaseAfterConfirmPress();
}

export function nextReviewPhaseAfterPersist(args: {
  persistOk: boolean;
  preparingPaintedAt: number | null;
  now: number;
  minVisibleMs?: number;
}): "review" | "preparing" | "ready" {
  if (!args.persistOk) return "review";
  const ok = canAdvancePreparingToReady({
    persistStatus: "succeeded",
    preparingPaintedAt: args.preparingPaintedAt,
    now: args.now,
    minVisibleMs: args.minVisibleMs ?? WORKSPACE_PREPARING_MIN_VISIBLE_MS,
  });
  return ok ? "ready" : "preparing";
}

export function destinationDuringWorkspaceReady(
  phase: "preparing" | "ready" | "setting_up"
): "workspace" {
  void phase;
  return "workspace";
}

export function destinationAfterReviewEditorCommit(): "review" {
  return "review";
}

export function assertReviewCompletionUsesWorkspaceReady(source: string): boolean {
  return (
    source.includes("WorkspaceReadyAck") &&
    source.includes('setPhase("workspace")') &&
    source.includes("persistStatus") &&
    source.includes("onSuccessNavigate") &&
    source.includes("await onConfirmPersist()")
  );
}

export function assertWorkspaceReadyCopy(ackSource: string, machineSource: string): boolean {
  return (
    ackSource.includes("WORKSPACE_PREPARING_TITLE") &&
    ackSource.includes("WORKSPACE_READY_TITLE") &&
    machineSource.includes(WORKSPACE_PREPARING_TITLE) &&
    machineSource.includes(WORKSPACE_READY_TITLE) &&
    machineSource.includes("Vyaamikk") &&
    !ackSource.includes("Setting up your workspace") &&
    !machineSource.includes("Setting up your workspace")
  );
}

/** Fast-path journey: persist ok instantly still blocks You until paints. */
export function simulateFastCompletionJourney(now = 1_000): {
  phases: WorkspaceCompletionPhase[];
  youBeforeReadyPaint: boolean;
  youBeforePreparingPaint: boolean;
} {
  const phases: WorkspaceCompletionPhase[] = [
    "review",
    phaseAfterConfirmPress(),
    phaseWhenWorkspaceSurfaceShown(),
  ];
  const beforePaint = nextReviewPhaseAfterPersist({
    persistOk: true,
    preparingPaintedAt: null,
    now,
  });
  phases.push(beforePaint);
  const afterPaint = nextReviewPhaseAfterPersist({
    persistOk: true,
    preparingPaintedAt: now,
    now: now + WORKSPACE_PREPARING_MIN_VISIBLE_MS,
  });
  phases.push(afterPaint);
  return {
    phases,
    youBeforePreparingPaint: destinationForPhase(beforePaint) === "you",
    youBeforeReadyPaint: canAdvanceReadyToYou({
      readyPaintedAt: null,
      now: now + WORKSPACE_PREPARING_MIN_VISIBLE_MS + 10_000,
      minVisibleMs: 720,
      alreadyNavigated: false,
    }),
  };
}
