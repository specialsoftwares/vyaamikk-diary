/**
 * Canonical in-memory pre-dashboard wizard navigation owner.
 *
 * User-directed intent (Back / Edit / Continue) is applied synchronously in
 * memory before any router.replace. AsyncStorage persistence is secondary and
 * must never gate the decision that suppresses forward guards.
 *
 * Decision priority (highest → lowest):
 * 1. Terminal restrictions (signed out / account deletion — handled outside)
 * 2. Final dashboard handoff when onboarding is fully complete
 * 3. User-directed wizard intent (reviewPreviousStep / continueForward)
 * 4. Cold-start restore from persistence (only when memory has no active session)
 * 5. Incomplete-step / boot resolution last
 */

import type { Href } from "expo-router";

import {
  hrefForWizardStep,
  type OnboardingNavigationIntent,
  type OnboardingWizardStep,
} from "@/auth/onboardingWizard";
import {
  clearOnboardingNavigationState,
  saveOnboardingNavigationState,
  type OnboardingNavigationState,
} from "@/auth/onboardingNavigationStore";

export type WizardProgressStage = "account" | "identity" | "review";

export interface WizardControllerSnapshot {
  uid: string | null;
  currentLogicalStep: OnboardingWizardStep;
  previousLogicalStep: OnboardingWizardStep | null;
  highestAuthorizedStep: OnboardingWizardStep | null;
  navigationIntent: OnboardingNavigationIntent;
  phoneE164: string | null;
  verifiedEmail: string | null;
  /** Monotonic id; reject async work tagged with an older generation. */
  transitionGeneration: number;
  transitionInProgress: boolean;
  /** Last dispatched route key — used to dedupe identical replaces. */
  lastDispatchedHrefKey: string | null;
  /** True once cold persistence was applied (or skipped as unnecessary). */
  persistenceHydrated: boolean;
  /** True when memory holds an active pre-dashboard session. */
  hasActiveSession: boolean;
  updatedAt: number;
}

export type WizardNavEvent =
  | {
      type: "CONTINUE";
      step: OnboardingWizardStep;
      uid?: string | null;
      phoneE164?: string | null;
      verifiedEmail?: string | null;
    }
  | {
      type: "REVIEW";
      step: OnboardingWizardStep;
      uid?: string | null;
      phoneE164?: string | null;
      verifiedEmail?: string | null;
    }
  | {
      type: "BOOT";
      step: OnboardingWizardStep;
      uid?: string | null;
      phoneE164?: string | null;
      verifiedEmail?: string | null;
    }
  | {
      type: "BACK";
      from: OnboardingWizardStep;
      uid?: string | null;
      phoneE164?: string | null;
      verifiedEmail?: string | null;
    }
  | {
      type: "HYDRATE_PERSISTENCE";
      state: OnboardingNavigationState;
      /** Only apply if memory still cold for this generation. */
      expectedGeneration: number;
    }
  | { type: "MARK_PERSISTENCE_HYDRATED" }
  | { type: "SET_AUTHORIZED"; step: OnboardingWizardStep }
  | { type: "CLEAR" }
  | { type: "TRANSITION_SETTLED"; generation: number };

export interface WizardDispatchResult {
  snapshot: WizardControllerSnapshot;
  generation: number;
  /** Target step after the event (null for CLEAR / settled). */
  targetStep: OnboardingWizardStep | null;
  href: Href | null;
  hrefKey: string | null;
  /** False when duplicate / stale — caller must not router.replace. */
  shouldNavigate: boolean;
  /** True when forward mount guards must stay quiet. */
  suppressForwardGuards: boolean;
}

const STAGE_ORDER: readonly WizardProgressStage[] = ["account", "identity", "review"];

const INITIAL: WizardControllerSnapshot = {
  uid: null,
  currentLogicalStep: "mobileEntry",
  previousLogicalStep: null,
  highestAuthorizedStep: null,
  navigationIntent: "bootResolution",
  phoneE164: null,
  verifiedEmail: null,
  transitionGeneration: 0,
  transitionInProgress: false,
  lastDispatchedHrefKey: null,
  persistenceHydrated: false,
  hasActiveSession: false,
  updatedAt: 0,
};

let memory: WizardControllerSnapshot = { ...INITIAL };
const listeners = new Set<(s: WizardControllerSnapshot) => void>();

function notify(): void {
  for (const l of listeners) l(memory);
}

function hrefKeyFor(href: Href | null): string | null {
  if (href == null) return null;
  if (typeof href === "string") return href;
  const pathname = "pathname" in href ? String(href.pathname ?? "") : "";
  const params =
    "params" in href && href.params && typeof href.params === "object"
      ? JSON.stringify(href.params)
      : "";
  return `${pathname}?${params}`;
}

/**
 * Deterministic one-step Back map (user-directed review):
 * review → form → email entry → mobile OTP → mobile confirm → mobile entry
 * (email OTP → email entry; identity-type lives inside the form screen).
 */
export function logicalBackTarget(
  step: OnboardingWizardStep
): OnboardingWizardStep | null {
  switch (step) {
    case "locationFootprint":
      return "onboardingIntro";
    case "onboardingIntro":
      return "ueidRelease";
    case "ueidRelease":
      return "profileReview";
    case "profileReview":
      return "businessIdentity";
    case "businessIdentity":
      return "emailEntry";
    case "emailOtp":
      return "emailEntry";
    case "emailEntry":
      return "phoneOtp";
    case "phoneOtp":
      return "phoneConfirm";
    case "phoneConfirm":
      return "mobileEntry";
    case "mobileEntry":
      return null;
    default:
      return null;
  }
}

export function wizardProgressStage(step: OnboardingWizardStep): WizardProgressStage {
  switch (step) {
    case "mobileEntry":
    case "phoneConfirm":
    case "phoneOtp":
    case "emailEntry":
    case "emailOtp":
      return "account";
    case "businessIdentity":
      return "identity";
    case "profileReview":
    case "ueidRelease":
    case "onboardingIntro":
    case "locationFootprint":
      return "review";
    default:
      return "account";
  }
}

export function wizardStageHeading(step: OnboardingWizardStep): string {
  switch (wizardProgressStage(step)) {
    case "account":
      return "Account";
    case "identity":
      return "Identity";
    case "review":
      return "Review";
  }
}

export function wizardStageModel(step: OnboardingWizardStep): {
  stage: WizardProgressStage;
  heading: string;
  stages: {
    id: WizardProgressStage;
    label: string;
    active: boolean;
    reached: boolean;
  }[];
} {
  const stage = wizardProgressStage(step);
  const activeIndex = STAGE_ORDER.indexOf(stage);
  return {
    stage,
    heading: wizardStageHeading(step),
    stages: STAGE_ORDER.map((id, index) => ({
      id,
      label: id === "account" ? "Account" : id === "identity" ? "Identity" : "Review",
      active: id === stage,
      reached: index <= activeIndex,
    })),
  };
}

function toPersisted(s: WizardControllerSnapshot): OnboardingNavigationState {
  return {
    uid: s.uid,
    currentStep: s.currentLogicalStep,
    intent: s.navigationIntent,
    phoneE164: s.phoneE164,
    verifiedEmail: s.verifiedEmail,
    updatedAt: s.updatedAt,
  };
}

/** Fire-and-forget — never awaited on the user-navigation critical path. */
function persistSecondary(s: WizardControllerSnapshot): void {
  void (async () => {
    try {
      if (!s.hasActiveSession) {
        await clearOnboardingNavigationState();
        return;
      }
      await saveOnboardingNavigationState(toPersisted(s));
    } catch {
      // Persistence is secondary; failures must not affect navigation decisions.
    }
  })();
}

function applyStep(
  step: OnboardingWizardStep,
  intent: OnboardingNavigationIntent,
  extras: {
    uid?: string | null;
    phoneE164?: string | null;
    verifiedEmail?: string | null;
  },
  opts: { navigate: boolean }
): WizardDispatchResult {
  const previous = memory.currentLogicalStep;
  const generation = memory.transitionGeneration + 1;
  const href = opts.navigate ? hrefForWizardStep(step) : null;
  const key = hrefKeyFor(href);
  const duplicate =
    opts.navigate &&
    memory.transitionInProgress &&
    memory.lastDispatchedHrefKey != null &&
    memory.lastDispatchedHrefKey === key;

  memory = {
    ...memory,
    uid: extras.uid !== undefined ? extras.uid : memory.uid,
    previousLogicalStep: previous === step ? memory.previousLogicalStep : previous,
    currentLogicalStep: step,
    navigationIntent: intent,
    phoneE164: extras.phoneE164 !== undefined ? extras.phoneE164 : memory.phoneE164,
    verifiedEmail:
      extras.verifiedEmail !== undefined ? extras.verifiedEmail : memory.verifiedEmail,
    transitionGeneration: generation,
    transitionInProgress: opts.navigate ? !duplicate : false,
    lastDispatchedHrefKey: opts.navigate ? key : memory.lastDispatchedHrefKey,
    hasActiveSession: true,
    updatedAt: Date.now(),
  };
  persistSecondary(memory);
  notify();

  // Brief in-flight window for dedupe / mount races; never stick forever.
  if (opts.navigate && !duplicate) {
    const settledGen = generation;
    queueMicrotask(() => {
      if (memory.transitionGeneration === settledGen && memory.transitionInProgress) {
        memory = { ...memory, transitionInProgress: false };
        notify();
      }
    });
  }

  return {
    snapshot: memory,
    generation,
    targetStep: step,
    href,
    hrefKey: key,
    shouldNavigate: opts.navigate && !duplicate,
    suppressForwardGuards: intent === "reviewPreviousStep" || memory.transitionInProgress,
  };
}

export function getWizardSnapshot(): WizardControllerSnapshot {
  return memory;
}

export function subscribeWizardNavigation(
  listener: (s: WizardControllerSnapshot) => void
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function isReviewIntentActive(): boolean {
  return memory.hasActiveSession && memory.navigationIntent === "reviewPreviousStep";
}

/**
 * Sync guard used by mount effects. Priority: user review / in-flight transition
 * always wins over boot incomplete-step resolution.
 */
export function shouldSuppressForwardGuard(screenStep: OnboardingWizardStep): boolean {
  if (!memory.hasActiveSession) return false;
  if (memory.navigationIntent === "reviewPreviousStep") return true;
  if (memory.transitionInProgress) return true;
  // Memory already owns a different step — don't steal with boot replace.
  if (
    memory.navigationIntent === "continueForward" &&
    memory.currentLogicalStep !== screenStep
  ) {
    return true;
  }
  return false;
}

export function isStaleTransitionGeneration(generation: number): boolean {
  return generation !== memory.transitionGeneration;
}

export function dispatchWizardNav(event: WizardNavEvent): WizardDispatchResult {
  switch (event.type) {
    case "CONTINUE":
      return applyStep(event.step, "continueForward", event, { navigate: true });
    case "REVIEW":
      return applyStep(event.step, "reviewPreviousStep", event, { navigate: true });
    case "BOOT":
      // Boot must not override an active user-directed review session.
      if (isReviewIntentActive()) {
        return {
          snapshot: memory,
          generation: memory.transitionGeneration,
          targetStep: memory.currentLogicalStep,
          href: null,
          hrefKey: null,
          shouldNavigate: false,
          suppressForwardGuards: true,
        };
      }
      return applyStep(event.step, "bootResolution", event, { navigate: false });
    case "BACK": {
      const target = logicalBackTarget(event.from);
      if (!target) {
        return {
          snapshot: memory,
          generation: memory.transitionGeneration,
          targetStep: null,
          href: null,
          hrefKey: null,
          shouldNavigate: false,
          suppressForwardGuards: isReviewIntentActive(),
        };
      }
      return applyStep(target, "reviewPreviousStep", event, { navigate: true });
    }
    case "HYDRATE_PERSISTENCE": {
      if (isStaleTransitionGeneration(event.expectedGeneration)) {
        return {
          snapshot: memory,
          generation: memory.transitionGeneration,
          targetStep: memory.currentLogicalStep,
          href: null,
          hrefKey: null,
          shouldNavigate: false,
          suppressForwardGuards: shouldSuppressForwardGuard(memory.currentLogicalStep),
        };
      }
      // Never let late persistence override user-directed memory.
      if (memory.hasActiveSession && memory.navigationIntent === "reviewPreviousStep") {
        memory = { ...memory, persistenceHydrated: true };
        notify();
        return {
          snapshot: memory,
          generation: memory.transitionGeneration,
          targetStep: memory.currentLogicalStep,
          href: null,
          hrefKey: null,
          shouldNavigate: false,
          suppressForwardGuards: true,
        };
      }
      if (memory.hasActiveSession && memory.navigationIntent === "continueForward") {
        memory = { ...memory, persistenceHydrated: true };
        notify();
        return {
          snapshot: memory,
          generation: memory.transitionGeneration,
          targetStep: memory.currentLogicalStep,
          href: null,
          hrefKey: null,
          shouldNavigate: false,
          suppressForwardGuards: shouldSuppressForwardGuard(memory.currentLogicalStep),
        };
      }
      const s = event.state;
      memory = {
        ...memory,
        uid: s.uid,
        currentLogicalStep: s.currentStep,
        previousLogicalStep: memory.currentLogicalStep,
        navigationIntent: s.intent,
        phoneE164: s.phoneE164,
        verifiedEmail: s.verifiedEmail,
        persistenceHydrated: true,
        hasActiveSession: true,
        updatedAt: s.updatedAt,
      };
      notify();
      return {
        snapshot: memory,
        generation: memory.transitionGeneration,
        targetStep: s.currentStep,
        href: null,
        hrefKey: null,
        shouldNavigate: false,
        suppressForwardGuards: s.intent === "reviewPreviousStep",
      };
    }
    case "MARK_PERSISTENCE_HYDRATED":
      memory = { ...memory, persistenceHydrated: true };
      notify();
      return {
        snapshot: memory,
        generation: memory.transitionGeneration,
        targetStep: memory.currentLogicalStep,
        href: null,
        hrefKey: null,
        shouldNavigate: false,
        suppressForwardGuards: shouldSuppressForwardGuard(memory.currentLogicalStep),
      };
    case "SET_AUTHORIZED":
      memory = { ...memory, highestAuthorizedStep: event.step };
      notify();
      return {
        snapshot: memory,
        generation: memory.transitionGeneration,
        targetStep: memory.currentLogicalStep,
        href: null,
        hrefKey: null,
        shouldNavigate: false,
        suppressForwardGuards: shouldSuppressForwardGuard(memory.currentLogicalStep),
      };
    case "CLEAR":
      memory = { ...INITIAL, persistenceHydrated: true, updatedAt: Date.now() };
      void (async () => {
        try {
          await clearOnboardingNavigationState();
        } catch {
          /* secondary */
        }
      })();
      notify();
      return {
        snapshot: memory,
        generation: memory.transitionGeneration,
        targetStep: null,
        href: null,
        hrefKey: null,
        shouldNavigate: false,
        suppressForwardGuards: false,
      };
    case "TRANSITION_SETTLED":
      if (event.generation === memory.transitionGeneration) {
        memory = { ...memory, transitionInProgress: false };
        notify();
      }
      return {
        snapshot: memory,
        generation: memory.transitionGeneration,
        targetStep: memory.currentLogicalStep,
        href: null,
        hrefKey: null,
        shouldNavigate: false,
        suppressForwardGuards: shouldSuppressForwardGuard(memory.currentLogicalStep),
      };
    default:
      return {
        snapshot: memory,
        generation: memory.transitionGeneration,
        targetStep: memory.currentLogicalStep,
        href: null,
        hrefKey: null,
        shouldNavigate: false,
        suppressForwardGuards: shouldSuppressForwardGuard(memory.currentLogicalStep),
      };
  }
}

/** Test-only reset. */
export function __resetWizardNavigationControllerForTests(): void {
  memory = { ...INITIAL };
  listeners.clear();
}
