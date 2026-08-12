/**
 * Post-Review workspace completion — pure phase machine.
 *
 * Visible contract (not timer-only):
 * review → committing → preparing (must paint) → ready (must paint) → you
 *
 * Navigation to You is owned solely by the ready→you transition after paint + settle.
 */

export type WorkspaceCompletionPhase =
  | "review"
  | "committing"
  | "preparing"
  | "ready"
  | "you"
  | "error";

export type WorkspacePersistStatus = "idle" | "pending" | "succeeded" | "failed";

export const WORKSPACE_PREPARING_TITLE = "Vyaamikk is preparing your workspace…";
export const WORKSPACE_PREPARING_SUBTITLE =
  "We’re securing your account details and getting your workspace ready.";
/** Shown only while persist is genuinely pending — maps to profile completion work. */
export const WORKSPACE_PREPARING_STATUS_PENDING = "Securing your profile";
export const WORKSPACE_READY_TITLE = "Your workspace is ready";
export const WORKSPACE_READY_SUBTITLE = "Everything is set. Taking you to Vyaamikk…";

/** Minimum readable preparing time AFTER first paint/layout (not from confirm press). */
export const WORKSPACE_PREPARING_MIN_VISIBLE_MS = 1200;
/**
 * Reduced motion shortens/removes decorative motion — NOT readable status duration.
 * Keep preparing at the lower end of the perceptible band (~1100–1300ms).
 */
export const WORKSPACE_PREPARING_MIN_VISIBLE_REDUCED_MS = 1100;
/** Minimum ready settle AFTER first paint/layout before You navigation. */
export const WORKSPACE_READY_MIN_VISIBLE_MS = 820;
/** Reduced motion: retain readable Ready; do not collapse to ~200ms. */
export const WORKSPACE_READY_MIN_VISIBLE_REDUCED_MS = 750;

/** Resolve preparing min for accessibility preference. */
export function workspacePreparingMinVisibleMs(reducedMotion: boolean): number {
  return reducedMotion
    ? WORKSPACE_PREPARING_MIN_VISIBLE_REDUCED_MS
    : WORKSPACE_PREPARING_MIN_VISIBLE_MS;
}

/** Resolve ready min for accessibility preference. */
export function workspaceReadyMinVisibleMs(reducedMotion: boolean): number {
  return reducedMotion
    ? WORKSPACE_READY_MIN_VISIBLE_REDUCED_MS
    : WORKSPACE_READY_MIN_VISIBLE_MS;
}

export function phaseAfterConfirmPress(): "committing" {
  return "committing";
}

export function phaseWhenWorkspaceSurfaceShown(): "preparing" {
  return "preparing";
}

/**
 * May advance preparing → ready only when:
 * - preparing has painted
 * - persist succeeded
 * - min visible ms elapsed since paint
 */
export function canAdvancePreparingToReady(args: {
  persistStatus: WorkspacePersistStatus;
  preparingPaintedAt: number | null;
  now: number;
  minVisibleMs: number;
}): boolean {
  if (args.persistStatus !== "succeeded") return false;
  if (args.preparingPaintedAt == null) return false;
  return args.now - args.preparingPaintedAt >= args.minVisibleMs;
}

/**
 * May navigate ready → you only when ready has painted and settle elapsed.
 */
export function canAdvanceReadyToYou(args: {
  readyPaintedAt: number | null;
  now: number;
  minVisibleMs: number;
  alreadyNavigated: boolean;
}): boolean {
  if (args.alreadyNavigated) return false;
  if (args.readyPaintedAt == null) return false;
  return args.now - args.readyPaintedAt >= args.minVisibleMs;
}

export function destinationForPhase(
  phase: WorkspaceCompletionPhase
): "review" | "workspace" | "you" | "error" {
  if (phase === "you") return "you";
  if (phase === "error") return "error";
  if (phase === "review" || phase === "committing") return "review";
  return "workspace";
}

/** Exactly-once You events from a completion journey. */
export function countYouNavigations(events: ("confirm" | "persist_ok" | "ready_done")[]): number {
  return events.filter((e) => e === "ready_done").length;
}

/**
 * Real post-confirm operations (production). Harness simulates the user-facing
 * equivalent without Firebase/Firestore.
 */
export const WORKSPACE_COMPLETION_REAL_OPS = {
  production: [
    "assertDurableLogo",
    "persistIssuerIdentitySnapshot",
    "updateProfileWithProfileCompletedAt",
    "clearOnboardingDraft",
    "authSessionProfileReconcile",
  ] as const,
  harness: ["simulateLocalReviewSessionCommit"] as const,
} as const;
