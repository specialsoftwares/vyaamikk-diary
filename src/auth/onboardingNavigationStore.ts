/**
 * Persisted wizard navigation — current step + intent, separate from
 * server identity completion. Survives screen remounts; cleared on
 * first dashboard entry / sign-out restart.
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

export async function setOnboardingWizardStep(input: {
  step: OnboardingWizardStep;
  intent: OnboardingNavigationIntent;
  uid?: string | null;
  phoneE164?: string | null;
  verifiedEmail?: string | null;
}): Promise<OnboardingNavigationState> {
  const prev = await loadOnboardingNavigationState();
  const next: OnboardingNavigationState = {
    uid: input.uid !== undefined ? input.uid : prev?.uid ?? null,
    currentStep: input.step,
    intent: input.intent,
    phoneE164: input.phoneE164 !== undefined ? input.phoneE164 : prev?.phoneE164 ?? null,
    verifiedEmail:
      input.verifiedEmail !== undefined ? input.verifiedEmail : prev?.verifiedEmail ?? null,
    updatedAt: Date.now(),
  };
  await saveOnboardingNavigationState(next);
  return next;
}

/** True when a deliberate Back/review should suppress boot-style forward redirects. */
export function isReviewingPreviousStep(
  state: OnboardingNavigationState | null | undefined
): boolean {
  return state?.intent === "reviewPreviousStep";
}
