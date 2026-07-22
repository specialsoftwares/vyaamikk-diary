/**
 * Persisted wizard navigation — secondary durable copy of the in-memory
 * wizardNavigationController. Survives process death; cleared on first
 * dashboard entry / sign-out. Must never be awaited on the Back critical path.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

import type {
  OnboardingNavigationIntent,
  OnboardingWizardStep,
} from "@/auth/onboardingWizard";
import { ONBOARDING_WIZARD_STEPS } from "@/auth/onboardingWizard";

const KEY = "vyd_onboarding_wizard_nav_v1";

export interface OnboardingNavigationState {
  uid: string | null;
  currentStep: OnboardingWizardStep;
  intent: OnboardingNavigationIntent;
  /** Phone E.164 tied to this wizard session (for change detection). */
  phoneE164: string | null;
  /** Last verified email string in this incomplete session. */
  verifiedEmail: string | null;
  updatedAt: number;
}

function isWizardStep(v: unknown): v is OnboardingWizardStep {
  return typeof v === "string" && (ONBOARDING_WIZARD_STEPS as readonly string[]).includes(v);
}

function isIntent(v: unknown): v is OnboardingNavigationIntent {
  return v === "bootResolution" || v === "continueForward" || v === "reviewPreviousStep";
}

export async function loadOnboardingNavigationState(): Promise<OnboardingNavigationState | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<OnboardingNavigationState>;
    if (!isWizardStep(parsed.currentStep) || !isIntent(parsed.intent)) return null;
    return {
      uid: typeof parsed.uid === "string" ? parsed.uid : null,
      currentStep: parsed.currentStep,
      intent: parsed.intent,
      phoneE164: typeof parsed.phoneE164 === "string" ? parsed.phoneE164 : null,
      verifiedEmail: typeof parsed.verifiedEmail === "string" ? parsed.verifiedEmail : null,
      updatedAt: typeof parsed.updatedAt === "number" ? parsed.updatedAt : Date.now(),
    };
  } catch {
    return null;
  }
}

export async function saveOnboardingNavigationState(
  state: OnboardingNavigationState
): Promise<void> {
  await AsyncStorage.setItem(
    KEY,
    JSON.stringify({ ...state, updatedAt: Date.now() } satisfies OnboardingNavigationState)
  );
}

export async function clearOnboardingNavigationState(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
}

/**
 * Compatibility writer — prefers the in-memory controller when available.
 * Prefer markReviewingWizardStep / markContinuingWizardStep / dispatchWizardNav.
 */
export async function setOnboardingWizardStep(input: {
  step: OnboardingWizardStep;
  intent: OnboardingNavigationIntent;
  uid?: string | null;
  phoneE164?: string | null;
  verifiedEmail?: string | null;
}): Promise<OnboardingNavigationState> {
  const { dispatchWizardNav } = await import("@/auth/wizardNavigationController");
  if (input.intent === "reviewPreviousStep") {
    dispatchWizardNav({
      type: "REVIEW",
      step: input.step,
      uid: input.uid,
      phoneE164: input.phoneE164,
      verifiedEmail: input.verifiedEmail,
    });
  } else if (input.intent === "continueForward") {
    dispatchWizardNav({
      type: "CONTINUE",
      step: input.step,
      uid: input.uid,
      phoneE164: input.phoneE164,
      verifiedEmail: input.verifiedEmail,
    });
  } else {
    dispatchWizardNav({
      type: "BOOT",
      step: input.step,
      uid: input.uid,
      phoneE164: input.phoneE164,
      verifiedEmail: input.verifiedEmail,
    });
  }
  const { getWizardSnapshot } = await import("@/auth/wizardNavigationController");
  const snap = getWizardSnapshot();
  return {
    uid: snap.uid,
    currentStep: snap.currentLogicalStep,
    intent: snap.navigationIntent,
    phoneE164: snap.phoneE164,
    verifiedEmail: snap.verifiedEmail,
    updatedAt: snap.updatedAt,
  };
}

/** True when a deliberate Back/review should suppress boot-style forward redirects. */
export function isReviewingPreviousStep(
  state: OnboardingNavigationState | null | undefined
): boolean {
  return state?.intent === "reviewPreviousStep";
}
