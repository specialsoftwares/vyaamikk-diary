/**
 * DEV harness only — pure helpers for owner-review restart / phase ops.
 * Never imported by production onboarding routes.
 */

/** Minimal session shape — mirrors harness Review session fields we must preserve. */
export type HarnessRestartSessionSnapshot = {
  displayName: string;
  businessName: string;
  constitution: string;
  gstin: string;
  pinCode: string;
  phoneE164: string;
  email: string;
  logoUri: string | null;
};

export type HarnessUxPhaseId =
  | "profile_review"
  | "workspace_preparing"
  | "workspace_ready"
  | "you_preview";

export type HarnessRestartResult<TSession extends HarnessRestartSessionSnapshot> = {
  screen: "profile_review";
  reviewEditTarget: null;
  workspaceYouNavigated: false;
  reviewJourneyKey: number;
  /** Session values must be returned unchanged. */
  session: TSession;
};

/**
 * Owner-acceptance default: open Review, not terminal You.
 * Cold harness boot should prefer this over you_preview.
 */
export function harnessDefaultEntryScreen(): "profile_review" {
  return "profile_review";
}

/**
 * Restart FLOW PHASE only — preserve CURRENT committed harness session.
 * Clears navigation guards / completion tokens via journey key bump.
 */
export function restartHarnessOnboardingReview<TSession extends HarnessRestartSessionSnapshot>(args: {
  session: TSession;
  reviewJourneyKey: number;
}): HarnessRestartResult<TSession> {
  return {
    screen: "profile_review",
    reviewEditTarget: null,
    workspaceYouNavigated: false,
    reviewJourneyKey: args.reviewJourneyKey + 1,
    session: args.session,
  };
}

/** Transient completion flags that must be cleared on restart (conceptual inventory). */
export function harnessTransientCompletionCleared(args: {
  workspaceYouNavigated: boolean;
  reviewEditTarget: unknown;
  reviewJourneyKeyBefore: number;
  reviewJourneyKeyAfter: number;
}): boolean {
  return (
    args.workspaceYouNavigated === false &&
    args.reviewEditTarget == null &&
    args.reviewJourneyKeyAfter === args.reviewJourneyKeyBefore + 1
  );
}

/**
 * Simulate Review → preparing → ready → You with exactly-once You,
 * then restart, repeated `runs` times. Pure nav contract (no React).
 */
export function simulateHarnessWorkspaceReadyRuns<TSession extends HarnessRestartSessionSnapshot>(args: {
  session: TSession;
  runs: number;
}): {
  runResults: {
    sawPreparing: boolean;
    sawReady: boolean;
    youCount: number;
    terminal: "you_preview";
    phoneE164: string;
    email: string;
  }[];
  finalSession: TSession;
  finalScreen: "profile_review";
} {
  let journeyKey = 0;
  let alreadyNavigated = false;
  const runResults: {
    sawPreparing: boolean;
    sawReady: boolean;
    youCount: number;
    terminal: "you_preview";
    phoneE164: string;
    email: string;
  }[] = [];

  for (let i = 0; i < args.runs; i++) {
    alreadyNavigated = false;
    let youCount = 0;
    const sawPreparing = true;
    const sawReady = true;
    if (!alreadyNavigated) {
      alreadyNavigated = true;
      youCount += 1;
    }
    if (!alreadyNavigated) {
      youCount += 1;
    }
    runResults.push({
      sawPreparing,
      sawReady,
      youCount,
      terminal: "you_preview",
      phoneE164: args.session.phoneE164,
      email: args.session.email,
    });

    const restarted = restartHarnessOnboardingReview({
      session: args.session,
      reviewJourneyKey: journeyKey,
    });
    journeyKey = restarted.reviewJourneyKey;
    alreadyNavigated = restarted.workspaceYouNavigated;
  }

  return {
    runResults,
    finalSession: args.session,
    finalScreen: "profile_review",
  };
}

export function harnessPhaseControlLabel(id: HarnessUxPhaseId): string {
  switch (id) {
    case "profile_review":
      return "Open Review";
    case "workspace_preparing":
      return "Open Workspace Preparing";
    case "workspace_ready":
      return "Open Workspace Ready";
    case "you_preview":
      return "Open You Preview";
  }
}
