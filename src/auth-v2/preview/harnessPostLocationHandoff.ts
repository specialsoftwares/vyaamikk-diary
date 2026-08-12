/**
 * Pure DEV harness post-location handoff helpers.
 * Presentation-only — never writes production profile / Firestore.
 */

export type HarnessIdentityPhase = "details" | "location";

export type HarnessPostLocationScreen =
  | "location"
  | "profile_review"
  | "you_preview";

/** Location Continue in details → location; in location → profile review (no Alert). */
export function nextHarnessScreenAfterIdentityContinue(
  phase: HarnessIdentityPhase
): HarnessPostLocationScreen | "location" {
  if (phase === "details") return "location";
  return "profile_review";
}

export type ProfileConfirmSideEffectKind =
  | "preview_local_simulate"
  | "production_completeOnboardingProfile";

/** Preview Confirm must never select production persistence. */
export function harnessProfileConfirmSideEffectKind(): ProfileConfirmSideEffectKind {
  return "preview_local_simulate";
}

/** Local simulated success — no Firebase / Firestore / Auth. */
export async function simulateHarnessProfileCompletion(opts?: {
  /** Override latency for tests. Default restrained ~520ms so pending status is visible. */
  delayMs?: number;
  fail?: boolean;
}): Promise<"ready"> {
  const delayMs = opts?.delayMs ?? 520;
  if (delayMs > 0) {
    await new Promise<void>((r) => setTimeout(r, delayMs));
  }
  if (opts?.fail) {
    throw new Error("Could not complete profile. Please try again.");
  }
  return "ready";
}

/**
 * Harness post-Review phase machine (conceptual).
 * Presentation still owns WorkspaceReadyAck; harness screen stays on profile_review
 * until ready settle, then you_preview — never review→you in one hop.
 */
export type HarnessReviewCompletionScreen =
  | "profile_review"
  | "workspace_setting_up"
  | "workspace_ready"
  | "you_preview";

export function nextHarnessScreenAfterReviewConfirm(): Exclude<
  HarnessReviewCompletionScreen,
  "profile_review" | "you_preview"
> {
  return "workspace_setting_up";
}

export function nextHarnessScreenAfterWorkspaceReadySettle(): "you_preview" {
  return "you_preview";
}

export function harnessEditorCommitDestination(): "profile_review" {
  return "profile_review";
}

export function shouldNavigateHarnessYouAfterWorkspaceReady(args: {
  phase: "review" | "setting_up" | "preparing" | "ready";
  alreadyNavigated: boolean;
}): boolean {
  const phase = args.phase === "setting_up" ? "preparing" : args.phase;
  return phase === "ready" && !args.alreadyNavigated;
}

/** Static source contract: production screen must still call authoritative completion. */
export function productionProfileReviewUsesAuthoritativeCompletion(source: string): boolean {
  return (
    source.includes("completeOnboardingProfile") &&
    source.includes("ProfileReviewPresentation") &&
    source.includes('router.replace("/(app)/(tabs)/you")')
  );
}

/** Static source contract: harness must not call production completion. */
export function harnessAvoidsProductionProfileWrite(source: string): boolean {
  return (
    !source.includes("completeOnboardingProfile") &&
    source.includes("simulateHarnessProfileCompletion") &&
    source.includes("profile_review")
  );
}
